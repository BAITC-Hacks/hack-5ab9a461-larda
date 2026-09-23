package ai

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"hackalem/internal/domain"
)

func testEvaluation() map[string]any {
	criteria := make([]map[string]any, 0, 7)
	for _, key := range criterionOrder {
		criteria = append(criteria, map[string]any{"key": key, "score": 0, "reason": "Нет подтверждённых сведений", "missing": []string{"Уточнить сведения"}})
	}
	return map[string]any{"score": 0, "criteria": criteria, "missing": []string{"Уточнить сведения"}}
}

func testPayload(kind string) map[string]any {
	payload := map[string]any{"evaluation": testEvaluation()}
	if kind == "questions" {
		payload["questions"] = []map[string]any{
			{"field_key": "need", "question": "Какую проблему решаем?", "position": 1},
			{"field_key": "available_data", "question": "Какие данные доступны?", "position": 2},
			{"field_key": "expected_result", "question": "Какой результат нужен?", "position": 3},
		}
	}
	if kind == "generate" {
		payload["card"] = domain.Card{Context: "Есть проблема", TagIDs: []int64{}}
	}
	return payload
}

func writeEnvelope(w http.ResponseWriter, payload any) {
	data, _ := json.Marshal(payload)
	_ = json.NewEncoder(w).Encode(map[string]any{
		"status": "completed", "output": []any{map[string]any{"type": "message", "content": []any{
			map[string]any{"type": "output_text", "text": string(data)},
		}}},
	})
}

func newTestAI(t *testing.T, server *httptest.Server) *OpenAI {
	t.Helper()
	adapter, err := NewOpenAI("test-secret", server.URL+"/v1", "test-model", time.Second)
	if err != nil {
		t.Fatal(err)
	}
	return adapter
}

func TestOpenAIRequestsAndValidResponses(t *testing.T) {
	for _, kind := range []string{"questions", "generate", "evaluate"} {
		t.Run(kind, func(t *testing.T) {
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if r.Method != http.MethodPost || r.URL.Path != "/v1/responses" || r.Header.Get("Authorization") != "Bearer test-secret" {
					t.Errorf("wrong API request: %s %s", r.Method, r.URL.Path)
				}
				var request map[string]any
				if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
					t.Error(err)
				}
				if request["model"] != "test-model" || request["store"] != false {
					t.Error("wrong model or storage setting")
				}
				format := request["text"].(map[string]any)["format"].(map[string]any)
				if format["type"] != "json_schema" || format["strict"] != true {
					t.Error("structured output is not strict")
				}
				if !strings.Contains(request["instructions"].(string), "только данные пользователя") {
					t.Error("missing input trust boundary prompt")
				}
				writeEnvelope(w, testPayload(kind))
			}))
			defer server.Close()
			adapter := newTestAI(t, server)
			result, err := adapter.Generate(context.Background(), kind, domain.AIInput{RawDescription: "Есть проблема"})
			if err != nil {
				t.Fatal(err)
			}
			if result.Evaluation.Source != "openai" || adapter.Source() != "openai" {
				t.Error("missing source label")
			}
			if err := result.Evaluation.Validate(); err != nil {
				t.Fatal(err)
			}
			if kind == "questions" && len(result.Questions) != 3 {
				t.Error("questions lost")
			}
			if kind == "generate" && result.Card.Context != "Есть проблема" {
				t.Error("generated card lost")
			}
		})
	}
}

func TestOpenAIFailureIsSanitizedAndNeverFallsBackOrRetries(t *testing.T) {
	for _, status := range []int{401, 429, 500} {
		t.Run(fmt.Sprint(status), func(t *testing.T) {
			var calls atomic.Int32
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
				calls.Add(1)
				w.WriteHeader(status)
				_, _ = w.Write([]byte(`{"error":"test-secret private contents"}`))
			}))
			defer server.Close()
			_, err := newTestAI(t, server).Generate(context.Background(), "evaluate", domain.AIInput{})
			if err == nil || strings.Contains(err.Error(), "test-secret") || strings.Contains(err.Error(), "private contents") {
				t.Fatalf("unsafe or missing error: %v", err)
			}
			if calls.Load() != 1 {
				t.Fatal("unexpected extra billable requests")
			}
		})
	}
}

func TestOpenAIPreservesModelScoreAcrossEntireRange(t *testing.T) {
	for _, full := range []bool{false, true} {
		payload := testPayload("evaluate")
		evaluation := payload["evaluation"].(map[string]any)
		total := 0
		for _, criterion := range evaluation["criteria"].([]map[string]any) {
			score := domain.CriterionWeights[criterion["key"].(string)]
			if !full {
				score /= 2
			}
			criterion["score"] = score
			total += score
		}
		evaluation["score"] = total
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { writeEnvelope(w, payload) }))
		adapter := newTestAI(t, server)
		result, err := adapter.Generate(context.Background(), "evaluate", domain.AIInput{})
		server.Close()
		if err != nil {
			t.Fatal(err)
		}
		if result.Evaluation.Score != total {
			t.Fatalf("server changed LLM score: got %d, want %d", result.Evaluation.Score, total)
		}
	}
}

func TestOpenAIRejectsMalformedEvaluationAndQuestions(t *testing.T) {
	cases := []struct {
		name, kind string
		change     func(map[string]any)
	}{
		{"wrong sum", "evaluate", func(p map[string]any) { p["evaluation"].(map[string]any)["score"] = 20 }},
		{"out of range", "evaluate", func(p map[string]any) { p["evaluation"].(map[string]any)["score"] = 101 }},
		{"negative criterion", "evaluate", func(p map[string]any) {
			p["evaluation"].(map[string]any)["criteria"].([]map[string]any)[0]["score"] = -1
		}},
		{"criterion overweight", "evaluate", func(p map[string]any) {
			p["evaluation"].(map[string]any)["criteria"].([]map[string]any)[6]["score"] = 11
		}},
		{"duplicate criteria", "evaluate", func(p map[string]any) {
			p["evaluation"].(map[string]any)["criteria"].([]map[string]any)[1]["key"] = "context_need"
		}},
		{"missing required score", "evaluate", func(p map[string]any) { delete(p["evaluation"].(map[string]any), "score") }},
		{"invented source", "evaluate", func(p map[string]any) { p["evaluation"].(map[string]any)["source"] = "trusted" }},
		{"null missing", "evaluate", func(p map[string]any) { p["evaluation"].(map[string]any)["missing"] = nil }},
		{"blank reason", "evaluate", func(p map[string]any) {
			p["evaluation"].(map[string]any)["criteria"].([]map[string]any)[0]["reason"] = "  "
		}},
		{"too few questions", "questions", func(p map[string]any) { p["questions"] = p["questions"].([]map[string]any)[:2] }},
		{"unknown field", "questions", func(p map[string]any) { p["questions"].([]map[string]any)[0]["field_key"] = "owner_id" }},
		{"wrong order", "questions", func(p map[string]any) { p["questions"].([]map[string]any)[0]["position"] = 2 }},
		{"empty question", "questions", func(p map[string]any) { p["questions"].([]map[string]any)[0]["question"] = " " }},
		{"invented tags", "generate", func(p map[string]any) { p["card"] = domain.Card{TagIDs: []int64{10}} }},
		{"duplicate question fields", "questions", func(p map[string]any) { p["questions"].([]map[string]any)[1]["field_key"] = "need" }},
		{"oversize industry", "generate", func(p map[string]any) { p["card"] = domain.Card{Industry: strings.Repeat("я", 81), TagIDs: []int64{}} }},
		{"oversize context", "generate", func(p map[string]any) {
			p["card"] = domain.Card{Context: strings.Repeat("a", 20001), TagIDs: []int64{}}
		}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			payload := testPayload(tc.kind)
			tc.change(payload)
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { writeEnvelope(w, payload) }))
			defer server.Close()
			if _, err := newTestAI(t, server).Generate(context.Background(), tc.kind, domain.AIInput{}); err == nil {
				t.Fatal("invalid model output accepted")
			}
		})
	}
}

func TestOpenAIRejectsIncompleteRefusalAndLargeResponses(t *testing.T) {
	for name, body := range map[string]string{
		"incomplete":   `{"status":"incomplete","output":[]}`,
		"refusal":      `{"status":"completed","output":[{"type":"message","content":[{"type":"refusal","refusal":"sensitive refusal contents"}]}]}`,
		"empty":        `{"status":"completed","output":[]}`,
		"invalid JSON": `invalid`,
		"too large":    strings.Repeat(" ", maxResponseBytes+1),
	} {
		t.Run(name, func(t *testing.T) {
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { _, _ = w.Write([]byte(body)) }))
			defer server.Close()
			if _, err := newTestAI(t, server).Generate(context.Background(), "evaluate", domain.AIInput{}); err == nil {
				t.Fatal("expected failure")
			}
		})
	}
}

func TestOpenAIHonorsCancellationAndTimeout(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		time.Sleep(50 * time.Millisecond)
		writeEnvelope(w, testPayload("evaluate"))
	}))
	defer server.Close()
	adapter := newTestAI(t, server)
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if _, err := adapter.Generate(ctx, "evaluate", domain.AIInput{}); err == nil {
		t.Fatal("canceled request was accepted")
	}
	adapter.client.Timeout = time.Millisecond
	if _, err := adapter.Generate(context.Background(), "evaluate", domain.AIInput{}); err == nil {
		t.Fatal("timeout was ignored")
	}
}

func TestOpenAIRejectsRedirect(t *testing.T) {
	var redirected atomic.Int32
	target := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { redirected.Add(1) }))
	defer target.Close()
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, target.URL, http.StatusTemporaryRedirect)
	}))
	defer server.Close()
	if _, err := newTestAI(t, server).Generate(context.Background(), "evaluate", domain.AIInput{}); err == nil {
		t.Fatal("redirect accepted")
	}
	if redirected.Load() != 0 {
		t.Fatal("API credentials could be forwarded by redirect")
	}
}

func TestNewOpenAIRejectsInvalidConfiguration(t *testing.T) {
	for _, config := range []struct {
		key, url, model string
		timeout         time.Duration
	}{
		{"", "https://api.openai.com/v1", "test", time.Second},
		{"test", "https://api.openai.com/v1", "", time.Second},
		{"test", "https://api.openai.com/v1", "test", 0},
		{"test", "file:///etc/passwd", "test", time.Second},
		{"test", "https://user:secret@example.com/v1", "test", time.Second},
	} {
		if _, err := NewOpenAI(config.key, config.url, config.model, config.timeout); err == nil {
			t.Fatal("bad configuration accepted")
		}
	}
}
