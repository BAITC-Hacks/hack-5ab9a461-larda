package domain

import (
	"errors"
	"math"
	"reflect"
	"testing"
)

func TestReadinessBoundaries(t *testing.T) {
	for _, tc := range []struct {
		score int
		want  string
	}{
		{0, "draft"}, {39, "draft"}, {40, "working"}, {69, "working"},
		{70, "ready"}, {89, "ready"}, {90, "priority"}, {100, "priority"},
	} {
		if got := Readiness(tc.score); got != tc.want {
			t.Errorf("Readiness(%d) = %s, want %s", tc.score, got, tc.want)
		}
	}
}

func evaluationWithScore(score int) Evaluation {
	out := Evaluation{Score: score, Criteria: []Criterion{}}
	remaining := score
	for _, key := range []string{"context_need", "data", "result", "success_criteria", "constraints", "users", "communication"} {
		points := min(remaining, CriterionWeights[key])
		out.Criteria = append(out.Criteria, Criterion{Key: key, Score: points, Reason: "Обоснование модели"})
		remaining -= points
	}
	return out
}

func TestEvaluationAcceptsEveryValidScore(t *testing.T) {
	for score := 0; score <= 100; score++ {
		if err := evaluationWithScore(score).Validate(); err != nil {
			t.Errorf("valid score %d rejected: %v", score, err)
		}
	}
}

func TestEvaluationRejectsInvalidCriterionBreakdown(t *testing.T) {
	for _, tc := range []struct {
		name   string
		mutate func(*Evaluation)
	}{
		{"negative total", func(e *Evaluation) { e.Score = -1 }},
		{"total above 100", func(e *Evaluation) { e.Score = 101 }},
		{"sum mismatch", func(e *Evaluation) { e.Score = 1 }},
		{"missing criterion", func(e *Evaluation) { e.Criteria = e.Criteria[:6] }},
		{"extra criterion", func(e *Evaluation) { e.Criteria = append(e.Criteria, e.Criteria[0]) }},
		{"unknown criterion", func(e *Evaluation) { e.Criteria[0].Key = "invented" }},
		{"duplicate criterion", func(e *Evaluation) { e.Criteria[0].Key = e.Criteria[1].Key }},
		{"empty explanation", func(e *Evaluation) { e.Criteria[0].Reason = " \n\t" }},
		{"negative criterion", func(e *Evaluation) { e.Criteria[0].Score = -1 }},
		{"criterion exceeds weight", func(e *Evaluation) { e.Criteria[6].Score = 11; e.Score = 11 }},
	} {
		t.Run(tc.name, func(t *testing.T) {
			e := evaluationWithScore(0)
			tc.mutate(&e)
			if err := e.Validate(); !errors.Is(err, ErrInvalid) {
				t.Fatalf("expected invalid evaluation, got %v", err)
			}
		})
	}
}

func TestSplitRewardPreservesPoolAndAwardsRemainderByUserID(t *testing.T) {
	for _, tc := range []struct {
		name    string
		amount  int64
		members []int64
		want    map[int64]int64
	}{
		{"uneven", 100, []int64{2, 7, 99}, map[int64]int64{2: 34, 7: 33, 99: 33}},
		{"multiple remainder", 5, []int64{2, 7, 99}, map[int64]int64{2: 2, 7: 2, 99: 1}},
		{"zero shares recorded", 1, []int64{2, 7, 99}, map[int64]int64{2: 1, 7: 0, 99: 0}},
		{"zero reward", 0, []int64{2, 7}, map[int64]int64{2: 0, 7: 0}},
		{"single member", 100, []int64{42}, map[int64]int64{42: 100}},
		{"maximum amount", math.MaxInt64, []int64{2, 7}, map[int64]int64{2: math.MaxInt64/2 + 1, 7: math.MaxInt64 / 2}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			actual, err := SplitReward(tc.amount, tc.members)
			if err != nil {
				t.Fatal(err)
			}
			if !reflect.DeepEqual(actual, tc.want) {
				t.Fatalf("got %#v, want %#v", actual, tc.want)
			}
			var sum int64
			for _, share := range actual {
				sum += share
			}
			if sum != tc.amount {
				t.Fatalf("pool changed: sum %d, amount %d", sum, tc.amount)
			}
		})
	}
}

func TestSplitRewardRejectsInvalidPoolOrMembers(t *testing.T) {
	for _, tc := range []struct {
		name    string
		amount  int64
		members []int64
	}{
		{"negative reward", -1, []int64{1}}, {"empty team", 100, nil},
		{"zero ID", 100, []int64{0, 1}}, {"negative ID", 100, []int64{-1, 1}},
		{"duplicate member", 100, []int64{1, 1}}, {"unsorted IDs", 100, []int64{2, 1}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			shares, err := SplitReward(tc.amount, tc.members)
			if !errors.Is(err, ErrInvalid) || shares != nil {
				t.Fatalf("expected rejected pool without partial payouts, got %#v, %v", shares, err)
			}
		})
	}
}
