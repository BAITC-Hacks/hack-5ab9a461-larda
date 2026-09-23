package httpapi

import (
	"fmt"
	"net/http"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
	"larda/internal/application"
	"larda/internal/domain"
	"larda/internal/ports"
)

func (h handler) taskRoutes(v1 *gin.RouterGroup) {
	v1.GET("/tasks", func(c *gin.Context) {
		filter, err := catalogFilter(c)
		if err != nil {
			respondError(c, err)
			return
		}
		value, err := h.service.Catalog(c.Request.Context(), filter)
		respond(c, http.StatusOK, value, err)
	})
	v1.GET("/tasks/mine", requireActor, func(c *gin.Context) {
		value, err := h.service.MyTasks(c.Request.Context(), actorID(c))
		respond(c, http.StatusOK, value, err)
	})
	v1.POST("/tasks", requireActor, func(c *gin.Context) {
		var input application.CreateTaskInput
		if !decode(c, &input) {
			return
		}
		value, err := h.service.CreateTask(c.Request.Context(), actorID(c), input)
		respond(c, http.StatusAccepted, value, err)
	})
	v1.GET("/tasks/:taskID", func(c *gin.Context) {
		id, ok := paramID(c, "taskID")
		if !ok {
			return
		}
		value, err := h.service.Task(c.Request.Context(), actorID(c), id)
		respond(c, http.StatusOK, value, err)
	})
	v1.PATCH("/tasks/:taskID", requireActor, func(c *gin.Context) {
		id, ok := paramID(c, "taskID")
		if !ok {
			return
		}
		var input application.DraftPatch
		if !decode(c, &input) {
			return
		}
		value, err := h.service.PatchTask(c.Request.Context(), actorID(c), id, input)
		respond(c, http.StatusAccepted, value, err)
	})
	v1.GET("/tasks/:taskID/questions", requireActor, func(c *gin.Context) {
		id, ok := paramID(c, "taskID")
		if !ok {
			return
		}
		value, err := h.service.Questions(c.Request.Context(), actorID(c), id)
		respond(c, http.StatusOK, value, err)
	})
	v1.POST("/tasks/:taskID/answers", requireActor, func(c *gin.Context) {
		id, ok := paramID(c, "taskID")
		if !ok {
			return
		}
		var input application.AnswersInput
		if !decode(c, &input) {
			return
		}
		value, err := h.service.AnswerQuestions(c.Request.Context(), actorID(c), id, input)
		respond(c, http.StatusAccepted, value, err)
	})
	v1.GET("/tasks/:taskID/ai-jobs", requireActor, func(c *gin.Context) {
		id, ok := paramID(c, "taskID")
		if !ok {
			return
		}
		value, err := h.service.Jobs(c.Request.Context(), actorID(c), id)
		respond(c, http.StatusOK, value, err)
	})
	v1.POST("/tasks/:taskID/ai/retry", requireActor, func(c *gin.Context) {
		id, ok := paramID(c, "taskID")
		if !ok {
			return
		}
		value, err := h.service.RetryAI(c.Request.Context(), actorID(c), id)
		respond(c, http.StatusAccepted, value, err)
	})
	v1.POST("/tasks/:taskID/confirm", requireActor, func(c *gin.Context) {
		id, ok := paramID(c, "taskID")
		if !ok {
			return
		}
		var input struct {
			Revision int64 `json:"revision"`
		}
		if !decode(c, &input) {
			return
		}
		value, err := h.service.ConfirmTask(c.Request.Context(), actorID(c), id, input.Revision)
		respond(c, http.StatusOK, value, err)
	})
	v1.POST("/tasks/:taskID/publish", requireActor, func(c *gin.Context) {
		id, ok := paramID(c, "taskID")
		if !ok {
			return
		}
		value, err := h.service.PublishTask(c.Request.Context(), actorID(c), id)
		respond(c, http.StatusOK, value, err)
	})
	v1.POST("/tasks/:taskID/archive", requireActor, func(c *gin.Context) {
		id, ok := paramID(c, "taskID")
		if !ok {
			return
		}
		value, err := h.service.ArchiveTask(c.Request.Context(), actorID(c), id)
		respond(c, http.StatusOK, value, err)
	})
	v1.PUT("/users/me/tags", requireActor, func(c *gin.Context) {
		var input struct {
			TagIDs []int64 `json:"tag_ids"`
		}
		if !decode(c, &input) {
			return
		}
		if err := h.service.SetTags(c.Request.Context(), actorID(c), input.TagIDs); err != nil {
			respondError(c, err)
			return
		}
		c.Status(http.StatusNoContent)
	})
}

func catalogFilter(c *gin.Context) (ports.TaskFilter, error) {
	filter := ports.TaskFilter{Topic: c.Query("topic"), Industry: c.Query("industry"), Readiness: c.Query("readiness"), Limit: 20, PublishedOnly: true}
	if value, exists := c.GetQuery("limit"); exists {
		n, err := strconv.Atoi(value)
		if err != nil || n < 1 || n > 100 {
			return filter, fmt.Errorf("%w: limit must be between 1 and 100", domain.ErrInvalid)
		}
		filter.Limit = n
	}
	if value, exists := c.GetQuery("offset"); exists {
		n, err := strconv.Atoi(value)
		if err != nil || n < 0 {
			return filter, fmt.Errorf("%w: offset must be a nonnegative integer", domain.ErrInvalid)
		}
		filter.Offset = n
	}
	if value := c.Query("tag_ids"); value != "" {
		for _, item := range strings.Split(value, ",") {
			id, err := positiveID(strings.TrimSpace(item))
			if err != nil {
				return filter, fmt.Errorf("%w: tag_ids must be comma-separated positive integers", domain.ErrInvalid)
			}
			filter.TagIDs = append(filter.TagIDs, id)
		}
	}
	switch filter.Readiness {
	case "", "draft", "working", "ready", "priority":
	default:
		return filter, fmt.Errorf("%w: unknown readiness category", domain.ErrInvalid)
	}
	return filter, nil
}
