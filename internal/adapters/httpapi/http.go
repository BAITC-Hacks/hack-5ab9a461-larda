// Package httpapi is the Gin inbound adapter. Business rules live in application.
package httpapi

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"larda/internal/application"
	"larda/internal/domain"
)

const maxBodyBytes = 1 << 20

type handler struct{ service *application.Service }

// New builds the API. X-Demo-User-ID selects a seeded persona; it is not authentication.
func New(service *application.Service, origins []string) *gin.Engine {
	r := gin.New()
	r.Use(gin.Logger(), recoverErrors(), cors(origins))
	h := handler{service: service}
	r.GET("/livez", func(c *gin.Context) { c.JSON(http.StatusOK, gin.H{"status": "ok"}) })
	ready := func(c *gin.Context) {
		ctx, cancel := context.WithTimeout(c.Request.Context(), 2*time.Second)
		defer cancel()
		if err := service.Health(ctx); err != nil {
			fail(c, http.StatusServiceUnavailable, "unavailable", "database unavailable")
			return
		}
		c.JSON(http.StatusOK, gin.H{"status": "ok"})
	}
	r.GET("/healthz", ready)
	r.GET("/readyz", ready)
	v1 := r.Group("/api/v1", h.demoActor())
	h.commonRoutes(v1)
	h.taskRoutes(v1)
	h.workflowRoutes(v1)
	r.NoRoute(func(c *gin.Context) { fail(c, http.StatusNotFound, "not_found", "route not found") })
	r.NoMethod(func(c *gin.Context) { fail(c, http.StatusMethodNotAllowed, "method_not_allowed", "method not allowed") })
	r.HandleMethodNotAllowed = true
	return r
}

func recoverErrors() gin.HandlerFunc {
	return gin.CustomRecovery(func(c *gin.Context, _ any) {
		fail(c, http.StatusInternalServerError, "internal", "internal server error")
	})
}

func cors(origins []string) gin.HandlerFunc {
	allowed := make(map[string]bool, len(origins))
	for _, origin := range origins {
		if origin = strings.TrimSpace(origin); origin != "" && origin != "*" {
			allowed[origin] = true
		}
	}
	return func(c *gin.Context) {
		origin := c.GetHeader("Origin")
		if origin != "" {
			c.Header("Vary", "Origin")
			if !allowed[origin] {
				fail(c, http.StatusForbidden, "forbidden", "origin is not allowed")
				return
			}
			c.Header("Access-Control-Allow-Origin", origin)
			c.Header("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
			c.Header("Access-Control-Allow-Headers", "Content-Type, X-Demo-User-ID")
			c.Header("Access-Control-Max-Age", "600")
		}
		if c.Request.Method == http.MethodOptions {
			c.AbortWithStatus(http.StatusNoContent)
			return
		}
		c.Next()
	}
}

func (h handler) demoActor() gin.HandlerFunc {
	return func(c *gin.Context) {
		value := c.GetHeader("X-Demo-User-ID")
		if value == "" {
			c.Next()
			return
		}
		id, err := positiveID(value)
		if err != nil {
			respondError(c, fmt.Errorf("%w: X-Demo-User-ID must be a positive integer", domain.ErrInvalid))
			return
		}
		if _, err = h.service.User(c.Request.Context(), id); err != nil {
			respondError(c, err)
			return
		}
		c.Set("actorID", id)
		c.Next()
	}
}

func requireActor(c *gin.Context) {
	if actorID(c) == 0 {
		respondError(c, fmt.Errorf("%w: X-Demo-User-ID header is required", domain.ErrInvalid))
		return
	}
	c.Next()
}

func actorID(c *gin.Context) int64 { value, _ := c.Get("actorID"); id, _ := value.(int64); return id }

func positiveID(value string) (int64, error) {
	id, err := strconv.ParseInt(value, 10, 64)
	if err != nil || id <= 0 {
		return 0, fmt.Errorf("%w: ID must be a positive integer", domain.ErrInvalid)
	}
	return id, nil
}

func paramID(c *gin.Context, key string) (int64, bool) {
	id, err := positiveID(c.Param(key))
	if err != nil {
		respondError(c, err)
		return 0, false
	}
	return id, true
}

// decode rejects unknown fields, null, trailing values and oversized request bodies.
func decode(c *gin.Context, destination any) bool {
	if c.ContentType() != "application/json" {
		fail(c, http.StatusUnsupportedMediaType, "unsupported_media_type", "Content-Type must be application/json")
		return false
	}
	body, err := io.ReadAll(http.MaxBytesReader(c.Writer, c.Request.Body, maxBodyBytes))
	if err != nil {
		var tooLarge *http.MaxBytesError
		if errors.As(err, &tooLarge) {
			fail(c, http.StatusRequestEntityTooLarge, "payload_too_large", "request body exceeds 1 MiB")
			return false
		}
		respondError(c, fmt.Errorf("%w: could not read request body", domain.ErrInvalid))
		return false
	}
	body = bytes.TrimSpace(body)
	if len(body) == 0 || body[0] != '{' {
		respondError(c, fmt.Errorf("%w: a JSON object is required", domain.ErrInvalid))
		return false
	}
	decoder := json.NewDecoder(bytes.NewReader(body))
	decoder.DisallowUnknownFields()
	if err = decoder.Decode(destination); err != nil {
		respondError(c, fmt.Errorf("%w: malformed JSON or unknown field", domain.ErrInvalid))
		return false
	}
	var trailing any
	if err = decoder.Decode(&trailing); !errors.Is(err, io.EOF) {
		respondError(c, fmt.Errorf("%w: request must contain one JSON object", domain.ErrInvalid))
		return false
	}
	return true
}

func respond(c *gin.Context, status int, value any, err error) {
	if err != nil {
		respondError(c, err)
		return
	}
	c.JSON(status, value)
}

func respondError(c *gin.Context, err error) {
	switch {
	case errors.Is(err, domain.ErrInvalid):
		fail(c, http.StatusBadRequest, "invalid_input", err.Error())
	case errors.Is(err, domain.ErrForbidden):
		fail(c, http.StatusForbidden, "forbidden", "operation is not allowed")
	case errors.Is(err, domain.ErrNotFound):
		fail(c, http.StatusNotFound, "not_found", "resource not found")
	case errors.Is(err, domain.ErrConflict):
		fail(c, http.StatusConflict, "conflict", err.Error())
	default:
		_ = c.Error(err)
		fail(c, http.StatusInternalServerError, "internal", "internal server error")
	}
}

func fail(c *gin.Context, status int, code, message string) {
	c.AbortWithStatusJSON(status, gin.H{"error": gin.H{"code": code, "message": message}})
}

func (h handler) commonRoutes(v1 *gin.RouterGroup) {
	v1.GET("/users", func(c *gin.Context) {
		value, err := h.service.Users(c.Request.Context())
		respond(c, http.StatusOK, value, err)
	})
	v1.GET("/users/:userID", func(c *gin.Context) {
		id, ok := paramID(c, "userID")
		if !ok {
			return
		}
		value, err := h.service.Profile(c.Request.Context(), id)
		respond(c, http.StatusOK, value, err)
	})
	v1.GET("/tags", func(c *gin.Context) {
		value, err := h.service.Tags(c.Request.Context())
		respond(c, http.StatusOK, value, err)
	})
	v1.GET("/achievements", func(c *gin.Context) {
		value, err := h.service.Achievements(c.Request.Context())
		respond(c, http.StatusOK, value, err)
	})
}
