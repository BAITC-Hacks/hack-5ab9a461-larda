package ai

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"larda/internal/domain"
	"larda/internal/ports"
)

const maxResponseBytes = 1 << 20

type OpenAI struct {
	apiKey   string
	endpoint string
	model    string
	client   *http.Client
}

var _ ports.AI = (*OpenAI)(nil)

// NewOpenAI configures the Responses API. baseURL includes /v1, not /responses.
// Requests are not automatically retried: the persisted job can be retried
// explicitly without silently multiplying potentially billable calls.
func NewOpenAI(apiKey, baseURL, model string, timeout time.Duration) (*OpenAI, error) {
	if strings.TrimSpace(apiKey) == "" {
		return nil, errors.New("openai: API key is required")
	}
	if strings.TrimSpace(model) == "" {
		return nil, errors.New("openai: model is required")
	}
	if timeout <= 0 {
		return nil, errors.New("openai: timeout must be positive")
	}
	u, err := url.Parse(strings.TrimRight(baseURL, "/"))
	if err != nil || u.Host == "" || (u.Scheme != "https" && u.Scheme != "http") || u.User != nil || u.RawQuery != "" || u.Fragment != "" {
		return nil, errors.New("openai: invalid base URL")
	}
	u.Path = strings.TrimRight(u.Path, "/") + "/responses"
	return &OpenAI{apiKey: apiKey, endpoint: u.String(), model: model, client: &http.Client{
		Timeout:       timeout,
		CheckRedirect: func(_ *http.Request, _ []*http.Request) error { return http.ErrUseLastResponse },
	}}, nil
}

func (*OpenAI) Source() string { return "openai" }

func (a *OpenAI) Generate(ctx context.Context, kind string, input domain.AIInput) (domain.AIResult, error) {
	instruction, valid := kindPrompts[kind]
	if !valid {
		return domain.AIResult{}, errors.New("openai: unsupported operation")
	}
	// Normalise the empty list to JSON [] for the model's required card schema.
	if input.Card.TagIDs == nil {
		input.Card.TagIDs = []int64{}
	}
	inputJSON, err := json.Marshal(input)
	if err != nil {
		return domain.AIResult{}, errors.New("openai: cannot encode task input")
	}
	requestJSON, err := json.Marshal(map[string]any{
		"model": a.model, "instructions": systemPrompt + "\n\n" + instruction,
		"input": string(inputJSON), "store": false, "max_output_tokens": 6000,
		"text": map[string]any{"format": map[string]any{
			"type": "json_schema", "name": "larda_" + kind,
			"strict": true, "schema": responseSchema(kind),
		}},
	})
	if err != nil {
		return domain.AIResult{}, errors.New("openai: cannot encode request")
	}
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, a.endpoint, bytes.NewReader(requestJSON))
	if err != nil {
		return domain.AIResult{}, errors.New("openai: cannot create request")
	}
	request.Header.Set("Authorization", "Bearer "+a.apiKey)
	request.Header.Set("Content-Type", "application/json")
	response, err := a.client.Do(request)
	if err != nil {
		if ctx.Err() != nil {
			return domain.AIResult{}, fmt.Errorf("openai: request canceled: %w", ctx.Err())
		}
		// Do not forward raw transport errors: they can contain endpoint credentials.
		return domain.AIResult{}, errors.New("openai: network request failed or timed out")
	}
	defer response.Body.Close()
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return domain.AIResult{}, fmt.Errorf("openai: API returned HTTP %d; retry the saved job when the service is available", response.StatusCode)
	}
	body, err := io.ReadAll(io.LimitReader(response.Body, maxResponseBytes+1))
	if err != nil {
		return domain.AIResult{}, errors.New("openai: cannot read response")
	}
	if len(body) > maxResponseBytes {
		return domain.AIResult{}, errors.New("openai: response exceeded size limit")
	}
	var envelope struct {
		Status string          `json:"status"`
		Error  json.RawMessage `json:"error"`
		Output []struct {
			Type    string `json:"type"`
			Content []struct {
				Type string `json:"type"`
				Text string `json:"text"`
			} `json:"content"`
		} `json:"output"`
	}
	if err := json.Unmarshal(body, &envelope); err != nil {
		return domain.AIResult{}, errors.New("openai: invalid response envelope")
	}
	if envelope.Status != "completed" || (len(envelope.Error) > 0 && string(envelope.Error) != "null") {
		return domain.AIResult{}, errors.New("openai: response was incomplete or failed")
	}
	var output string
	for _, item := range envelope.Output {
		for _, content := range item.Content {
			if content.Type == "refusal" {
				return domain.AIResult{}, errors.New("openai: model refused to process this task")
			}
			if item.Type == "message" && content.Type == "output_text" {
				if output != "" {
					return domain.AIResult{}, errors.New("openai: multiple structured outputs")
				}
				output = content.Text
			}
		}
	}
	if strings.TrimSpace(output) == "" {
		return domain.AIResult{}, errors.New("openai: no structured output")
	}
	return decodeResult([]byte(output), kind, input)
}
