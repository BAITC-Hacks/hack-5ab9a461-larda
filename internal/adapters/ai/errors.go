package ai

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
)

// providerError exposes only messages authored here. The application can retain
// this diagnostic through PublicMessage without depending on this adapter or
// exposing an upstream response body, API key, or submitted task contents.
type providerError struct {
	message string
	cause   error
}

func (e *providerError) Error() string         { return e.message }
func (e *providerError) PublicMessage() string { return e.message }
func (e *providerError) Unwrap() error         { return e.cause }

func safeError(message string) error { return &providerError{message: message} }

func httpError(response *http.Response) error {
	// Only a recognized error code can affect the fixed diagnostic. Provider
	// messages are untrusted and can contain credentials or private task data.
	var envelope struct {
		Error struct {
			Code string `json:"code"`
		} `json:"error"`
	}
	_ = json.NewDecoder(io.LimitReader(response.Body, maxResponseBytes)).Decode(&envelope)
	switch response.StatusCode {
	case http.StatusBadRequest:
		return safeError("openai: HTTP 400; check OPENAI_MODEL and its support for Responses API structured outputs, or the request schema")
	case http.StatusUnauthorized:
		return safeError("openai: HTTP 401; check OPENAI_API_KEY")
	case http.StatusForbidden:
		return safeError("openai: HTTP 403; check the project's API and model permissions and regional availability")
	case http.StatusNotFound:
		return safeError("openai: HTTP 404; check OPENAI_MODEL, model access, and OPENAI_BASE_URL")
	case http.StatusRequestTimeout:
		return safeError("openai: HTTP 408; the provider timed out, retry the saved job")
	case http.StatusRequestEntityTooLarge:
		return safeError("openai: HTTP 413; shorten the task input before retrying")
	case http.StatusTooManyRequests:
		if envelope.Error.Code == "insufficient_quota" {
			return safeError("openai: HTTP 429 insufficient quota; check API credits, billing, and project spending limits before retrying")
		}
		return safeError("openai: HTTP 429 rate limit; wait before retrying the saved job")
	default:
		if response.StatusCode >= 500 {
			return safeError(fmt.Sprintf("openai: HTTP %d; temporary provider failure, retry the saved job later", response.StatusCode))
		}
		return safeError(fmt.Sprintf("openai: unexpected HTTP %d; check the API endpoint configuration", response.StatusCode))
	}
}
