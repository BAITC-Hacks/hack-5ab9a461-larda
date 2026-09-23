package ai

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"strings"
	"unicode/utf8"

	"hackalem/internal/domain"
)

var criterionOrder = []string{"context_need", "data", "result", "success_criteria", "constraints", "users", "communication"}
var cardFields = []string{"industry", "topic", "title", "context", "need", "target_users", "available_data", "constraints", "expected_result", "success_criteria", "contact", "interaction_format", "feedback_process"}

type schema = map[string]any

func objectSchema(properties map[string]any, required ...string) schema {
	return schema{"type": "object", "properties": properties, "required": required, "additionalProperties": false}
}

func arraySchema(items schema) schema { return schema{"type": "array", "items": items} }
func stringSchema() schema            { return schema{"type": "string"} }

func responseSchema(kind string) schema {
	criteria := make([]any, 0, len(criterionOrder))
	for _, key := range criterionOrder {
		criteria = append(criteria, objectSchema(map[string]any{
			"key":     schema{"type": "string", "enum": []string{key}},
			"score":   schema{"type": "integer", "minimum": 0, "maximum": domain.CriterionWeights[key]},
			"reason":  stringSchema(),
			"missing": arraySchema(stringSchema()),
		}, "key", "score", "reason", "missing"))
	}
	criteriaArray := arraySchema(schema{"anyOf": criteria})
	criteriaArray["minItems"], criteriaArray["maxItems"] = 7, 7

	properties := map[string]any{"evaluation": objectSchema(map[string]any{
		"score":    schema{"type": "integer", "minimum": 0, "maximum": 100},
		"criteria": criteriaArray,
		"missing":  arraySchema(stringSchema()),
	}, "score", "criteria", "missing")}
	required := []string{"evaluation"}
	if kind == "questions" {
		questions := arraySchema(objectSchema(map[string]any{
			"field_key": schema{"type": "string", "enum": cardFields},
			"question":  stringSchema(),
			"position":  schema{"type": "integer", "minimum": 1, "maximum": 7},
		}, "field_key", "question", "position"))
		questions["minItems"], questions["maxItems"] = 3, 7
		properties["questions"] = questions
		required = append(required, "questions")
	}
	if kind == "generate" {
		fields := make(map[string]any, len(cardFields)+1)
		for _, field := range cardFields {
			limit := 20000
			if field == "industry" || field == "topic" {
				limit = 80
			}
			fields[field] = schema{"type": "string", "maxLength": limit}
		}
		fields["tag_ids"] = arraySchema(schema{"type": "integer", "minimum": 1})
		properties["card"] = objectSchema(fields, append(append([]string{}, cardFields...), "tag_ids")...)
		required = append(required, "card")
	}
	return objectSchema(properties, required...)
}

// validateJSON checks the small JSON Schema subset used above. The provider's
// schema is also checked locally: never trust an upstream or compatible gateway.
func validateJSON(value any, rule schema) bool {
	if alternatives, ok := rule["anyOf"].([]any); ok {
		for _, alt := range alternatives {
			if validateJSON(value, alt.(schema)) {
				return true
			}
		}
		return false
	}
	switch rule["type"] {
	case "object":
		obj, ok := value.(map[string]any)
		if !ok {
			return false
		}
		props := rule["properties"].(map[string]any)
		if len(obj) != len(props) {
			return false
		}
		for key, child := range props {
			v, exists := obj[key]
			if !exists || !validateJSON(v, child.(schema)) {
				return false
			}
		}
	case "array":
		items, ok := value.([]any)
		if !ok {
			return false
		}
		if min, ok := rule["minItems"].(int); ok && len(items) < min {
			return false
		}
		if max, ok := rule["maxItems"].(int); ok && len(items) > max {
			return false
		}
		for _, item := range items {
			if !validateJSON(item, rule["items"].(schema)) {
				return false
			}
		}
	case "string":
		str, ok := value.(string)
		if !ok {
			return false
		}
		if max, ok := rule["maxLength"].(int); ok && utf8.RuneCountInString(str) > max {
			return false
		}
		if values, ok := rule["enum"].([]string); ok {
			found := false
			for _, candidate := range values {
				if str == candidate {
					found = true
					break
				}
			}
			if !found {
				return false
			}
		}
	case "integer":
		n, ok := value.(json.Number)
		if !ok {
			return false
		}
		i, err := n.Int64()
		if err != nil {
			return false
		}
		if min, ok := rule["minimum"].(int); ok && i < int64(min) {
			return false
		}
		if max, ok := rule["maximum"].(int); ok && i > int64(max) {
			return false
		}
	default:
		return false
	}
	return true
}

func decodeResult(data []byte, kind string, input domain.AIInput) (domain.AIResult, error) {
	var result domain.AIResult
	var raw any
	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.UseNumber()
	if err := decoder.Decode(&raw); err != nil || !validateJSON(raw, responseSchema(kind)) {
		return result, fmt.Errorf("openai: response does not match the required schema")
	}
	if err := decoder.Decode(new(any)); err != io.EOF {
		return result, fmt.Errorf("openai: unexpected trailing response data")
	}
	if err := json.Unmarshal(data, &result); err != nil {
		return result, fmt.Errorf("openai: invalid structured response")
	}
	result.Evaluation.Source = "openai"
	if err := result.Evaluation.Validate(); err != nil {
		return domain.AIResult{}, fmt.Errorf("openai: invalid score or criterion breakdown")
	}
	missing := append([]string{}, result.Evaluation.Missing...)
	for _, criterion := range result.Evaluation.Criteria {
		missing = append(missing, criterion.Missing...)
	}
	for _, item := range missing {
		if strings.TrimSpace(item) == "" {
			return domain.AIResult{}, fmt.Errorf("openai: empty missing-information description")
		}
	}
	if kind == "questions" {
		seen := map[string]bool{}
		for i, question := range result.Questions {
			if question.Position != i+1 || strings.TrimSpace(question.Question) == "" || seen[question.FieldKey] {
				return domain.AIResult{}, fmt.Errorf("openai: invalid question order, duplicate field or empty question")
			}
			seen[question.FieldKey] = true
		}
	}
	if kind == "generate" {
		if len(result.Card.TagIDs) != len(input.Card.TagIDs) {
			return domain.AIResult{}, fmt.Errorf("openai: generated card changed task tags")
		}
		for i, tagID := range input.Card.TagIDs {
			if result.Card.TagIDs[i] != tagID {
				return domain.AIResult{}, fmt.Errorf("openai: generated card changed task tags")
			}
		}
	}
	return result, nil
}
