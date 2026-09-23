package ai

import (
	"context"
	"reflect"
	"strings"
	"testing"

	"larda/internal/domain"
)

func TestFallbackPreservesFactsAndMapsAnswers(t *testing.T) {
	answer := "CSV файл с продажами за 2025 год"
	input := domain.AIInput{RawDescription: "Не понимаем причины падения продаж", Card: domain.Card{TagIDs: []int64{1}}, Questions: []domain.TaskQuestion{
		{FieldKey: "available_data", Answer: &answer}, {FieldKey: "expected_result"},
	}}
	result, err := NewFallback().Generate(context.Background(), "generate", input)
	if err != nil {
		t.Fatal(err)
	}
	if result.Card.Context != input.RawDescription || result.Card.Title != input.RawDescription || result.Card.AvailableData != answer {
		t.Fatal("known facts were not preserved")
	}
	if result.Card.Contact != "" || result.Card.ExpectedResult != "" || !reflect.DeepEqual(result.Card.TagIDs, input.Card.TagIDs) {
		t.Fatal("unknown facts or tags were invented")
	}
	if result.Evaluation.Source != "fallback" || !strings.Contains(result.Evaluation.Criteria[0].Reason, "деморежим") {
		t.Fatal("demo was not labeled")
	}
	if err := result.Evaluation.Validate(); err != nil {
		t.Fatal(err)
	}
}

func TestFallbackQuestionsAndDeterministicScores(t *testing.T) {
	adapter := NewFallback()
	for _, card := range []domain.Card{{}, {
		Context: "context", Need: "need", AvailableData: "data", ExpectedResult: "result", SuccessCriteria: "criteria",
		Constraints: "constraints", TargetUsers: "users", Contact: "contact", InteractionFormat: "weekly", FeedbackProcess: "review",
	}} {
		input := domain.AIInput{Card: card}
		questions, err := adapter.Generate(context.Background(), "questions", input)
		if err != nil {
			t.Fatal(err)
		}
		if len(questions.Questions) < 3 || len(questions.Questions) > 7 {
			t.Fatal("wrong clarification count")
		}
		for i, question := range questions.Questions {
			if question.Position != i+1 || cardField(&card, question.FieldKey) == nil {
				t.Fatal("invalid question")
			}
		}
		a, err := adapter.Generate(context.Background(), "evaluate", input)
		if err != nil {
			t.Fatal(err)
		}
		b, err := adapter.Generate(context.Background(), "evaluate", input)
		if err != nil {
			t.Fatal(err)
		}
		if !reflect.DeepEqual(a, b) {
			t.Fatal("demo score not deterministic")
		}
		if err := a.Evaluation.Validate(); err != nil {
			t.Fatal(err)
		}
		if card.Context == "" && a.Evaluation.Score != 0 {
			t.Fatal("empty card not zero")
		}
		if card.Context != "" && a.Evaluation.Score != 100 {
			t.Fatal("full card not 100")
		}
	}
}

func TestFallbackRejectsUnknownKindAndCanceledContext(t *testing.T) {
	adapter := NewFallback()
	if _, err := adapter.Generate(context.Background(), "unknown", domain.AIInput{}); err == nil {
		t.Fatal("unsupported kind accepted")
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if _, err := adapter.Generate(ctx, "evaluate", domain.AIInput{}); err == nil {
		t.Fatal("cancellation ignored")
	}
}
