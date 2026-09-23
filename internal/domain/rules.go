package domain

import (
	"errors"
	"fmt"
	"strings"
)

var (
	ErrNotFound  = errors.New("not found")
	ErrForbidden = errors.New("forbidden")
	ErrConflict  = errors.New("conflict")
	ErrInvalid   = errors.New("invalid input")
)

var CriterionWeights = map[string]int{"context_need": 20, "data": 20, "result": 15, "success_criteria": 15, "constraints": 10, "users": 10, "communication": 10}

func Readiness(score int) string {
	switch {
	case score < 40:
		return "draft"
	case score < 70:
		return "working"
	case score < 90:
		return "ready"
	default:
		return "priority"
	}
}

func (e Evaluation) Validate() error {
	if e.Score < 0 || e.Score > 100 || len(e.Criteria) != len(CriterionWeights) {
		return fmt.Errorf("%w: invalid evaluation", ErrInvalid)
	}
	seen := map[string]bool{}
	total := 0
	for _, c := range e.Criteria {
		max, ok := CriterionWeights[c.Key]
		if !ok || seen[c.Key] || c.Score < 0 || c.Score > max || strings.TrimSpace(c.Reason) == "" {
			return fmt.Errorf("%w: invalid criterion %s", ErrInvalid, c.Key)
		}
		seen[c.Key] = true
		total += c.Score
	}
	if total != e.Score {
		return fmt.Errorf("%w: score must equal criterion sum", ErrInvalid)
	}
	return nil
}

func SplitReward(amount int64, members []int64) (map[int64]int64, error) {
	if amount < 0 || len(members) == 0 {
		return nil, fmt.Errorf("%w: empty team or negative reward", ErrInvalid)
	}
	// Callers supply ascending unique IDs after locking the team.
	result := map[int64]int64{}
	q, r := amount/int64(len(members)), amount%int64(len(members))
	for i, id := range members {
		if id <= 0 || (i > 0 && members[i-1] >= id) {
			return nil, fmt.Errorf("%w: members must be sorted and unique", ErrInvalid)
		}
		result[id] = q
		if int64(i) < r {
			result[id]++
		}
	}
	return result, nil
}
