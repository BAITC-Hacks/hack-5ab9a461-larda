package application

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"log/slog"
	"strings"
	"time"
	"unicode/utf8"

	"larda/internal/domain"
	"larda/internal/ports"
)

type CreateTaskInput struct {
	RawDescription string  `json:"raw_description"`
	Industry       string  `json:"industry"`
	Topic          string  `json:"topic"`
	TagIDs         []int64 `json:"tag_ids"`
}

type DraftPatch struct {
	Revision          int64    `json:"revision"`
	RawDescription    *string  `json:"raw_description"`
	Industry          *string  `json:"industry"`
	Topic             *string  `json:"topic"`
	Title             *string  `json:"title"`
	Context           *string  `json:"context"`
	Need              *string  `json:"need"`
	TargetUsers       *string  `json:"target_users"`
	AvailableData     *string  `json:"available_data"`
	Constraints       *string  `json:"constraints"`
	ExpectedResult    *string  `json:"expected_result"`
	SuccessCriteria   *string  `json:"success_criteria"`
	Contact           *string  `json:"contact"`
	InteractionFormat *string  `json:"interaction_format"`
	FeedbackProcess   *string  `json:"feedback_process"`
	TagIDs            *[]int64 `json:"tag_ids"`
}
type Answer struct {
	QuestionID int64  `json:"question_id"`
	Answer     string `json:"answer"`
}
type AnswersInput struct {
	Revision int64    `json:"revision"`
	Answers  []Answer `json:"answers"`
}

func validateTags(r ports.Store, ids []int64) error {
	if len(ids) > 30 {
		return fmt.Errorf("%w: at most 30 tags", domain.ErrInvalid)
	}
	tags, err := r.Tags()
	if err != nil {
		return err
	}
	known := map[int64]bool{}
	for _, t := range tags {
		known[t.ID] = true
	}
	seen := map[int64]bool{}
	for _, id := range ids {
		if !known[id] || seen[id] {
			return fmt.Errorf("%w: unknown or duplicate tag", domain.ErrInvalid)
		}
		seen[id] = true
	}
	return nil
}
func validateCard(c domain.Card) error {
	if utf8.RuneCountInString(c.Industry) > 80 || utf8.RuneCountInString(c.Topic) > 80 {
		return fmt.Errorf("%w: industry/topic exceeds 80 characters", domain.ErrInvalid)
	}
	for _, v := range []string{c.Title, c.Context, c.Need, c.TargetUsers, c.AvailableData, c.Constraints, c.ExpectedResult, c.SuccessCriteria, c.Contact, c.InteractionFormat, c.FeedbackProcess} {
		if utf8.RuneCountInString(v) > 20000 {
			return fmt.Errorf("%w: card field exceeds 20000 characters", domain.ErrInvalid)
		}
	}
	return nil
}
func revision(t *domain.Task, want int64) error {
	if want <= 0 || want != t.Revision {
		return fmt.Errorf("%w: revision changed; reload the task", domain.ErrConflict)
	}
	return nil
}
func (s *Service) SetTags(ctx context.Context, actorID int64, ids []int64) error {
	return s.repo.Transact(ctx, func(r ports.Store) error {
		u, err := r.User(actorID, true)
		if err != nil {
			return err
		}
		if u.Role != "student" {
			return domain.ErrForbidden
		}
		if err = validateTags(r, ids); err != nil {
			return err
		}
		return r.SetUserTags(actorID, ids)
	})
}

// enqueue is part of the same transaction as the edit. No external call precedes persistence.
func enqueue(r ports.Store, t *domain.Task, kind string, questions []domain.TaskQuestion) error {
	t.AIStatus = "pending"
	t.AIError = ""
	t.DraftEvaluation = nil
	t.EvaluatedRevision = nil
	if err := r.PutTask(t); err != nil {
		return err
	}
	card := t.Card
	if t.DraftCard != nil {
		card = *t.DraftCard
	}
	j := domain.AIJob{TaskID: t.ID, Revision: t.Revision, Kind: kind, Status: "pending", Input: domain.AIInput{RawDescription: t.RawDescription, Card: card, Questions: questions}}
	return r.PutJob(&j)
}

func (s *Service) CreateTask(ctx context.Context, actorID int64, in CreateTaskInput) (out *domain.Task, err error) {
	if strings.TrimSpace(in.RawDescription) == "" || utf8.RuneCountInString(in.RawDescription) > 20000 {
		return nil, fmt.Errorf("%w: raw_description must contain 1..20000 characters", domain.ErrInvalid)
	}
	card := domain.Card{Industry: in.Industry, Topic: in.Topic, Context: in.RawDescription, TagIDs: in.TagIDs}
	if card.TagIDs == nil {
		card.TagIDs = []int64{}
	}
	if err = validateCard(card); err != nil {
		return nil, err
	}
	err = s.repo.Transact(ctx, func(r ports.Store) error {
		if _, e := actor(r, actorID, "business"); e != nil {
			return e
		}
		if e := validateTags(r, in.TagIDs); e != nil {
			return e
		}
		out = &domain.Task{OwnerID: actorID, RawDescription: in.RawDescription, DraftCard: &card, Revision: 1, PublicationStatus: "draft", ExecutionStatus: "not_started", TeamExpReward: 100, BusinessExpReward: 50}
		return enqueue(r, out, "questions", nil)
	})
	return
}

// publicTask exposes confirmed content only; it never leaks a private edit or raw AI input.
func publicTask(t *domain.Task) {
	t.RawDescription = ""
	t.DraftCard = nil
	t.DraftEvaluation = nil
	t.EvaluatedRevision = nil
	t.AIError = ""
	t.AIStatus = ""
	t.Revision = 0
}
func (s *Service) Task(ctx context.Context, actorID, taskID int64) (out *domain.Task, err error) {
	err = s.repo.Read(ctx, func(r ports.Store) error {
		var e error
		out, e = r.Task(taskID, false)
		if e != nil {
			return e
		}
		if out.OwnerID != actorID {
			if out.PublicationStatus != "published" {
				return domain.ErrNotFound
			}
			publicTask(out)
		}
		return nil
	})
	return
}
func (s *Service) Catalog(ctx context.Context, f ports.TaskFilter) (out []domain.Task, err error) {
	if f.Limit == 0 {
		f.Limit = 20
	}
	if f.Limit < 1 || f.Limit > 100 || f.Offset < 0 {
		return nil, fmt.Errorf("%w: invalid pagination", domain.ErrInvalid)
	}
	switch f.Readiness {
	case "", "draft", "working", "ready", "priority":
	default:
		return nil, fmt.Errorf("%w: invalid readiness", domain.ErrInvalid)
	}
	f.PublishedOnly = true
	f.OwnerID = 0
	err = s.repo.Read(ctx, func(r ports.Store) error {
		var e error
		out, e = r.Tasks(f)
		if e != nil {
			return e
		}
		for i := range out {
			publicTask(&out[i])
		}
		return nil
	})
	return
}
func (s *Service) MyTasks(ctx context.Context, actorID int64) (out []domain.Task, err error) {
	err = s.repo.Read(ctx, func(r ports.Store) error {
		if _, e := actor(r, actorID, "business"); e != nil {
			return e
		}
		out, err = r.Tasks(ports.TaskFilter{OwnerID: actorID, Limit: 100})
		return err
	})
	return
}
func (s *Service) PatchTask(ctx context.Context, actorID, taskID int64, in DraftPatch) (out *domain.Task, err error) {
	err = s.repo.Transact(ctx, func(r ports.Store) error {
		var e error
		out, e = owned(r, actorID, taskID)
		if e != nil {
			return e
		}
		if e = editable(out); e != nil {
			return e
		}
		if e = revision(out, in.Revision); e != nil {
			return e
		}
		card := out.Card
		if out.DraftCard != nil {
			card = *out.DraftCard
		}
		changed := false
		fields := []struct {
			input *string
			dest  *string
		}{{in.Industry, &card.Industry}, {in.Topic, &card.Topic}, {in.Title, &card.Title}, {in.Context, &card.Context}, {in.Need, &card.Need}, {in.TargetUsers, &card.TargetUsers}, {in.AvailableData, &card.AvailableData}, {in.Constraints, &card.Constraints}, {in.ExpectedResult, &card.ExpectedResult}, {in.SuccessCriteria, &card.SuccessCriteria}, {in.Contact, &card.Contact}, {in.InteractionFormat, &card.InteractionFormat}, {in.FeedbackProcess, &card.FeedbackProcess}}
		for _, f := range fields {
			if f.input != nil {
				*f.dest = *f.input
				changed = true
			}
		}
		if in.RawDescription != nil {
			if strings.TrimSpace(*in.RawDescription) == "" || utf8.RuneCountInString(*in.RawDescription) > 20000 {
				return fmt.Errorf("%w: invalid raw_description", domain.ErrInvalid)
			}
			if in.Context == nil && card.Context == out.RawDescription {
				card.Context = *in.RawDescription
			}
			out.RawDescription = *in.RawDescription
			changed = true
		}
		if in.TagIDs != nil {
			if e = validateTags(r, *in.TagIDs); e != nil {
				return e
			}
			card.TagIDs = *in.TagIDs
			changed = true
		}
		if !changed {
			return fmt.Errorf("%w: empty patch", domain.ErrInvalid)
		}
		if e = validateCard(card); e != nil {
			return e
		}
		out.DraftCard = &card
		out.Revision++
		qs, e := r.Questions(out.ID)
		if e != nil {
			return e
		}
		kind := "evaluate"
		if len(qs) == 0 {
			kind = "questions"
		}
		return enqueue(r, out, kind, qs)
	})
	return
}
func (s *Service) Questions(ctx context.Context, actorID, taskID int64) (out []domain.TaskQuestion, err error) {
	err = s.repo.Read(ctx, func(r ports.Store) error {
		t, e := r.Task(taskID, false)
		if e != nil {
			return e
		}
		if t.OwnerID != actorID {
			return domain.ErrForbidden
		}
		out, err = r.Questions(taskID)
		return err
	})
	return
}
func (s *Service) AnswerQuestions(ctx context.Context, actorID, taskID int64, in AnswersInput) (out *domain.Task, err error) {
	err = s.repo.Transact(ctx, func(r ports.Store) error {
		var e error
		out, e = owned(r, actorID, taskID)
		if e != nil {
			return e
		}
		if e = editable(out); e != nil {
			return e
		}
		if e = revision(out, in.Revision); e != nil {
			return e
		}
		qs, e := r.Questions(taskID)
		if e != nil {
			return e
		}
		if len(qs) < 3 || len(in.Answers) != len(qs) {
			return fmt.Errorf("%w: answer every generated question", domain.ErrInvalid)
		}
		answers := map[int64]string{}
		for _, a := range in.Answers {
			if strings.TrimSpace(a.Answer) == "" || utf8.RuneCountInString(a.Answer) > 20000 {
				return fmt.Errorf("%w: invalid answer", domain.ErrInvalid)
			}
			if _, ok := answers[a.QuestionID]; ok {
				return fmt.Errorf("%w: duplicate question", domain.ErrInvalid)
			}
			answers[a.QuestionID] = a.Answer
		}
		for i := range qs {
			a, ok := answers[qs[i].ID]
			if !ok {
				return fmt.Errorf("%w: unknown or missing question", domain.ErrInvalid)
			}
			qs[i].Answer = &a
			if e = r.PutQuestion(&qs[i]); e != nil {
				return e
			}
		}
		if out.DraftCard == nil {
			c := out.Card
			out.DraftCard = &c
		}
		out.Revision++
		return enqueue(r, out, "generate", qs)
	})
	return
}
func (s *Service) ConfirmTask(ctx context.Context, actorID, taskID int64, wantRevision int64) (out *domain.Task, err error) {
	err = s.repo.Transact(ctx, func(r ports.Store) error {
		var e error
		out, e = owned(r, actorID, taskID)
		if e != nil {
			return e
		}
		if e = editable(out); e != nil {
			return e
		}
		if e = revision(out, wantRevision); e != nil {
			return e
		}
		if out.DraftCard == nil {
			if out.ConfirmedAt != nil {
				return nil
			}
			return domain.ErrConflict
		}
		if out.AIStatus != "succeeded" || out.DraftEvaluation == nil || out.EvaluatedRevision == nil || *out.EvaluatedRevision != out.Revision {
			return fmt.Errorf("%w: wait for successful evaluation of this revision", domain.ErrConflict)
		}
		if strings.TrimSpace(out.DraftCard.Title) == "" {
			return fmt.Errorf("%w: title is required to confirm", domain.ErrInvalid)
		}
		if e = out.DraftEvaluation.Validate(); e != nil {
			return e
		}
		if e = validateTags(r, out.DraftCard.TagIDs); e != nil {
			return e
		}
		out.Card = *out.DraftCard
		out.ReadinessScore = out.DraftEvaluation.Score
		out.ScoreBreakdown = *out.DraftEvaluation
		out.DraftCard = nil
		out.DraftEvaluation = nil
		n := now()
		out.ConfirmedAt = &n
		if e = r.SetTaskTags(out.ID, out.TagIDs); e != nil {
			return e
		}
		return r.PutTask(out)
	})
	return
}
func (s *Service) PublishTask(ctx context.Context, actorID, taskID int64) (out *domain.Task, err error) {
	err = s.repo.Transact(ctx, func(r ports.Store) error {
		var e error
		out, e = owned(r, actorID, taskID)
		if e != nil {
			return e
		}
		if e = editable(out); e != nil {
			return e
		}
		if out.PublicationStatus == "published" {
			return nil
		}
		if out.ConfirmedAt == nil || out.DraftCard != nil {
			return fmt.Errorf("%w: confirm the current card first", domain.ErrConflict)
		}
		out.PublicationStatus = "published"
		if out.PublishedAt == nil {
			n := now()
			out.PublishedAt = &n
		}
		if e = r.PutTask(out); e != nil {
			return e
		}
		if _, e = r.User(actorID, true); e != nil {
			return e
		}
		return awardAchievements(r, []int64{actorID})
	})
	return
}
func (s *Service) ArchiveTask(ctx context.Context, actorID, taskID int64) (out *domain.Task, err error) {
	err = s.repo.Transact(ctx, func(r ports.Store) error {
		var e error
		out, e = owned(r, actorID, taskID)
		if e != nil {
			return e
		}
		if e = editable(out); e != nil {
			return e
		}
		out.PublicationStatus = "archived"
		return r.PutTask(out)
	})
	return
}
func (s *Service) Jobs(ctx context.Context, actorID, taskID int64) (out []domain.AIJob, err error) {
	err = s.repo.Read(ctx, func(r ports.Store) error {
		t, e := r.Task(taskID, false)
		if e != nil {
			return e
		}
		if t.OwnerID != actorID {
			return domain.ErrForbidden
		}
		out, err = r.Jobs(taskID)
		return err
	})
	return
}
func (s *Service) RetryAI(ctx context.Context, actorID, taskID int64) (out *domain.Task, err error) {
	err = s.repo.Transact(ctx, func(r ports.Store) error {
		var e error
		out, e = owned(r, actorID, taskID)
		if e != nil {
			return e
		}
		if e = editable(out); e != nil {
			return e
		}
		if out.AIStatus != "failed" {
			return fmt.Errorf("%w: only failed checks can be retried", domain.ErrConflict)
		}
		jobs, e := r.Jobs(taskID)
		if e != nil {
			return e
		}
		if len(jobs) == 0 || jobs[0].Revision != out.Revision {
			return domain.ErrConflict
		}
		j, e := r.Job(jobs[0].ID, true)
		if e != nil {
			return e
		}
		j.Status = "pending"
		j.Error = ""
		j.LeaseToken = ""
		out.AIStatus = "pending"
		out.AIError = ""
		if e = r.PutJob(j); e != nil {
			return e
		}
		return r.PutTask(out)
	})
	return
}

// RunWorker is a durable, single-consumer loop; multiple instances use SKIP LOCKED.
func (s *Service) RunWorker(ctx context.Context, interval time.Duration) {
	ticker := time.NewTicker(interval)
	defer ticker.Stop()
	for {
		if err := s.ProcessNext(ctx); err != nil && !errors.Is(err, domain.ErrNotFound) && !errors.Is(err, context.Canceled) {
			slog.Error("AI worker operation failed", "error", err)
		}
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
		}
	}
}

func validateAIResult(job *domain.AIJob, result domain.AIResult) error {
	if err := result.Evaluation.Validate(); err != nil {
		return err
	}
	if job.Kind == "generate" {
		if result.Card == nil {
			return errors.New("AI response omitted card")
		}
		if err := validateCard(*result.Card); err != nil {
			return err
		}
		allowed, seen := map[int64]bool{}, map[int64]bool{}
		for _, id := range job.Input.Card.TagIDs {
			allowed[id] = true
		}
		for _, id := range result.Card.TagIDs {
			if !allowed[id] || seen[id] {
				return errors.New("AI invented or duplicated a tag")
			}
			seen[id] = true
		}
	}
	if job.Kind == "questions" {
		if len(result.Questions) < 3 || len(result.Questions) > 7 {
			return errors.New("AI response must contain 3..7 questions")
		}
		allowed := map[string]bool{}
		for _, key := range []string{"industry", "topic", "title", "context", "need", "target_users", "available_data", "constraints", "expected_result", "success_criteria", "contact", "interaction_format", "feedback_process", "tag_ids"} {
			allowed[key] = true
		}
		seen := map[string]bool{}
		for _, q := range result.Questions {
			if !allowed[q.FieldKey] || seen[q.FieldKey] || strings.TrimSpace(q.Question) == "" || utf8.RuneCountInString(q.Question) > 20000 {
				return errors.New("AI returned an invalid question")
			}
			seen[q.FieldKey] = true
		}
	}
	return nil
}

func supersede(r ports.Store, t *domain.Task, j *domain.AIJob) error {
	j.Status = "superseded"
	if err := r.PutJob(j); err != nil {
		return err
	}
	if t.Revision == j.Revision && editable(t) != nil {
		t.AIStatus = "failed"
		t.AIError = "Task closed before this check finished."
		return r.PutTask(t)
	}
	return nil
}

func (s *Service) ProcessNext(ctx context.Context) error {
	var tokenBytes [16]byte
	if _, err := rand.Read(tokenBytes[:]); err != nil {
		return err
	}
	token := hex.EncodeToString(tokenBytes[:])
	var job *domain.AIJob
	if err := s.repo.Transact(ctx, func(r ports.Store) error { var e error; job, e = r.ClaimJob(token); return e }); err != nil {
		return err
	}
	active := false
	if err := s.repo.Transact(ctx, func(r ports.Store) error {
		t, e := r.Task(job.TaskID, true)
		if e != nil {
			return e
		}
		j, e := r.Job(job.ID, true)
		if e != nil {
			return e
		}
		if j.LeaseToken != token {
			return nil
		}
		if t.Revision != job.Revision || editable(t) != nil {
			return supersede(r, t, j)
		}
		t.AIStatus = "running"
		active = true
		return r.PutTask(t)
	}); err != nil {
		return err
	}
	if !active {
		return nil
	}
	// Timeout is shorter than the 5 minute claim lease. Never hold a database transaction across the API call.
	callCtx, cancel := context.WithTimeout(ctx, 2*time.Minute)
	result, callErr := s.ai.Generate(callCtx, job.Kind, job.Input)
	cancel()
	if callErr == nil {
		callErr = validateAIResult(job, result)
	}
	// A canceled shutdown leaves a leased job for recovery; do not use a canceled context to persist.
	if ctx.Err() != nil {
		return ctx.Err()
	}
	return s.repo.Transact(ctx, func(r ports.Store) error {
		t, e := r.Task(job.TaskID, true)
		if e != nil {
			return e
		}
		j, e := r.Job(job.ID, true)
		if e != nil {
			return e
		}
		if j.LeaseToken != token || j.Status != "running" {
			return nil
		}
		if t.Revision != job.Revision || editable(t) != nil {
			return supersede(r, t, j)
		}
		if callErr == nil && result.Card != nil && job.Kind == "generate" {
			callErr = validateTags(r, result.Card.TagIDs)
			if callErr != nil && !errors.Is(callErr, domain.ErrInvalid) {
				return callErr
			}
		}
		if callErr != nil {
			j.Status = "failed"
			j.Error = "AI request failed or returned invalid data. Retry the check."
			t.AIStatus = "failed"
			t.AIError = j.Error
			if e = r.PutJob(j); e != nil {
				return e
			}
			return r.PutTask(t)
		}
		if result.Card != nil && job.Kind == "generate" {
			t.DraftCard = result.Card
		}
		if job.Kind == "questions" {
			for i := range result.Questions {
				q := result.Questions[i]
				q.Record = domain.Record{}
				q.TaskID = t.ID
				q.RoundNumber = 1
				q.Position = i + 1
				q.Answer = nil
				if e = r.PutQuestion(&q); e != nil {
					return e
				}
			}
		}
		result.Evaluation.Source = s.ai.Source()
		j.Status = "succeeded"
		j.Result = &result
		t.AIStatus = "succeeded"
		t.AIError = ""
		t.DraftEvaluation = &result.Evaluation
		v := t.Revision
		t.EvaluatedRevision = &v
		if e = r.PutJob(j); e != nil {
			return e
		}
		return r.PutTask(t)
	})
}
