package ai

import (
	"context"
	"errors"
	"strings"

	"larda/internal/domain"
	"larda/internal/ports"
)

// Fallback is an explicitly configured local demo, never a silent replacement
// for a failed OpenAI request. Its score checks field presence only.
type Fallback struct{}

var _ ports.AI = (*Fallback)(nil)

func NewFallback() *Fallback     { return &Fallback{} }
func (*Fallback) Source() string { return "fallback" }

func (*Fallback) Generate(ctx context.Context, kind string, input domain.AIInput) (domain.AIResult, error) {
	if err := ctx.Err(); err != nil {
		return domain.AIResult{}, err
	}
	card := input.Card
	result := domain.AIResult{}
	switch kind {
	case "questions":
		candidates := []struct{ field, question string }{
			{"need", "Какую конкретную проблему бизнеса нужно решить и почему это важно?"},
			{"available_data", "Какие данные доступны команде, в каком формате и как получить к ним доступ? Если данные не нужны, объясните почему."},
			{"expected_result", "Что именно должна передать команда в конце работы?"},
			{"success_criteria", "По каким измеримым или проверяемым критериям вы примете результат?"},
			{"constraints", "Какие есть сроки, технические ограничения и доступные ресурсы?"},
			{"target_users", "Кто будет пользоваться результатом и для какой задачи?"},
			{"contact", "Кто будет контактным лицом бизнеса и как с ним связаться?"},
			{"interaction_format", "Как часто и в каком формате команда сможет общаться с бизнесом?"},
			{"feedback_process", "Кто и в какой срок проверяет промежуточные результаты?"},
		}
		chosen := map[string]bool{}
		for _, candidate := range candidates {
			if strings.TrimSpace(*cardField(&card, candidate.field)) == "" && len(result.Questions) < 7 {
				chosen[candidate.field] = true
				result.Questions = append(result.Questions, domain.TaskQuestion{FieldKey: candidate.field, Question: candidate.question, Position: len(result.Questions) + 1})
			}
		}
		// A complete draft still needs the requested single clarification round.
		for _, candidate := range candidates {
			if len(result.Questions) >= 3 {
				break
			}
			if !chosen[candidate.field] {
				result.Questions = append(result.Questions, domain.TaskQuestion{FieldKey: candidate.field, Question: candidate.question, Position: len(result.Questions) + 1})
			}
		}
	case "generate":
		if strings.TrimSpace(card.Context) == "" {
			card.Context = strings.TrimSpace(input.RawDescription)
		}
		if strings.TrimSpace(card.Title) == "" {
			// A literal excerpt is safe in a demo: no semantic synthesis or invented facts.
			firstLine, _, _ := strings.Cut(strings.TrimSpace(input.RawDescription), "\n")
			title := []rune(firstLine)
			if len(title) > 120 {
				title = title[:120]
			}
			card.Title = string(title)
		}
		for _, question := range input.Questions {
			if question.Answer == nil {
				continue
			}
			if field := cardField(&card, question.FieldKey); field != nil {
				*field = strings.TrimSpace(*question.Answer)
			}
		}
		if card.TagIDs == nil {
			card.TagIDs = []int64{}
		}
		result.Card = &card
	case "evaluate":
	default:
		return domain.AIResult{}, errors.New("fallback: unsupported operation")
	}
	result.Evaluation = fallbackEvaluation(card)
	return result, nil
}

func cardField(card *domain.Card, key string) *string {
	switch key {
	case "industry":
		return &card.Industry
	case "topic":
		return &card.Topic
	case "title":
		return &card.Title
	case "context":
		return &card.Context
	case "need":
		return &card.Need
	case "target_users":
		return &card.TargetUsers
	case "available_data":
		return &card.AvailableData
	case "constraints":
		return &card.Constraints
	case "expected_result":
		return &card.ExpectedResult
	case "success_criteria":
		return &card.SuccessCriteria
	case "contact":
		return &card.Contact
	case "interaction_format":
		return &card.InteractionFormat
	case "feedback_process":
		return &card.FeedbackProcess
	default:
		return nil
	}
}

func fallbackEvaluation(card domain.Card) domain.Evaluation {
	fields := map[string][]string{
		"context_need": {"context", "need"}, "data": {"available_data"},
		"result": {"expected_result"}, "success_criteria": {"success_criteria"},
		"constraints": {"constraints"}, "users": {"target_users"},
		"communication": {"contact", "interaction_format", "feedback_process"},
	}
	result := domain.Evaluation{Source: "fallback", Criteria: []domain.Criterion{}, Missing: []string{}}
	for _, key := range criterionOrder {
		criterion := domain.Criterion{Key: key, Missing: []string{}, Reason: "Локальный деморежим: проверяется только заполненность полей; содержание не оценивалось LLM."}
		present := 0
		for _, field := range fields[key] {
			if strings.TrimSpace(*cardField(&card, field)) == "" {
				criterion.Missing = append(criterion.Missing, field)
				result.Missing = append(result.Missing, field)
			} else {
				present++
			}
		}
		criterion.Score = domain.CriterionWeights[key] * present / len(fields[key])
		result.Score += criterion.Score
		result.Criteria = append(result.Criteria, criterion)
	}
	return result
}
