package postgres

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"net/url"
	"os"
	"strings"
	"testing"
	"time"

	"larda/internal/adapters/ai"
	"larda/internal/application"
	"larda/internal/domain"
	"larda/internal/ports"
)

// Every test owns a newly-created schema. No existing tables or application data are reset.
func testRepo(t *testing.T) *Repository {
	t.Helper()
	dsn := os.Getenv("TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("set TEST_DATABASE_URL to run real PostgreSQL integration tests")
	}
	admin, err := Open(dsn)
	if err != nil {
		t.Fatal(err)
	}
	var bytes [8]byte
	if _, err = rand.Read(bytes[:]); err != nil {
		t.Fatal(err)
	}
	schema := "test_" + hex.EncodeToString(bytes[:])
	if err = admin.db.Exec("CREATE SCHEMA " + schema).Error; err != nil {
		t.Fatal(err)
	}
	u, err := url.Parse(dsn)
	if err != nil {
		t.Fatal(err)
	}
	q := u.Query()
	q.Set("search_path", schema)
	u.RawQuery = q.Encode()
	repo, err := Open(u.String())
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { repo.Close(); admin.db.Exec("DROP SCHEMA " + schema + " CASCADE"); admin.Close() })
	if err = repo.Migrate(context.Background()); err != nil {
		t.Fatal(err)
	}
	if err = repo.SeedDemo(context.Background()); err != nil {
		t.Fatal(err)
	}
	return repo
}
func taskGet(t *testing.T, s *application.Service, id int64) *domain.Task {
	t.Helper()
	task, err := s.Task(context.Background(), 1, id)
	if err != nil {
		t.Fatal(err)
	}
	return task
}
func taskProcess(t *testing.T, s *application.Service) {
	t.Helper()
	if err := s.ProcessNext(context.Background()); err != nil {
		t.Fatal(err)
	}
}

func TestTaskEndToEndAndConfirmedSnapshot(t *testing.T) {
	r := testRepo(t)
	ctx := context.Background()
	s := application.New(r, ai.NewFallback())
	created, err := s.CreateTask(ctx, 1, application.CreateTaskInput{RawDescription: "Кафе хочет планировать остатки продуктов", Topic: "retail", TagIDs: []int64{4}})
	if err != nil {
		t.Fatal(err)
	}
	if created.ID == 0 || created.AIStatus != "pending" {
		t.Fatal("task must be persisted before AI")
	}
	if _, err = s.Task(ctx, 2, created.ID); !errors.Is(err, domain.ErrNotFound) {
		t.Fatalf("draft leaked: %v", err)
	}
	taskProcess(t, s)
	task := taskGet(t, s, created.ID)
	if task.AIStatus != "succeeded" || task.DraftEvaluation == nil {
		t.Fatalf("evaluation missing: %+v", task)
	}
	qs, err := s.Questions(ctx, 1, task.ID)
	if err != nil || len(qs) < 3 {
		t.Fatalf("questions: %v %v", qs, err)
	}
	answers := []application.Answer{}
	for _, q := range qs {
		answers = append(answers, application.Answer{QuestionID: q.ID, Answer: "Подтверждённый ответ бизнеса для " + q.FieldKey})
	}
	if _, err = s.AnswerQuestions(ctx, 1, task.ID, application.AnswersInput{Revision: task.Revision, Answers: answers}); err != nil {
		t.Fatal(err)
	}
	taskProcess(t, s)
	task = taskGet(t, s, task.ID)
	confirmed, err := s.ConfirmTask(ctx, 1, task.ID, task.Revision)
	if err != nil {
		t.Fatal(err)
	}
	if confirmed.ReadinessScore <= 0 {
		t.Fatal("confirmed rating missing")
	}
	if _, err = s.PublishTask(ctx, 1, task.ID); err != nil {
		t.Fatal(err)
	}
	before, err := s.Task(ctx, 0, task.ID)
	if err != nil {
		t.Fatal(err)
	}
	if before.RawDescription != "" || before.DraftCard != nil || before.DraftEvaluation != nil {
		t.Fatal("private data leaked")
	}
	empty := ""
	title := "Новая карточка"
	patched, err := s.PatchTask(ctx, 1, task.ID, application.DraftPatch{Revision: task.Revision, Title: &title, SuccessCriteria: &empty})
	if err != nil {
		t.Fatal(err)
	}
	if _, err = s.ConfirmTask(ctx, 1, task.ID, patched.Revision); !errors.Is(err, domain.ErrConflict) {
		t.Fatalf("confirmed pending evaluation: %v", err)
	}
	public, err := s.Task(ctx, 2, task.ID)
	if err != nil {
		t.Fatal(err)
	}
	if public.Title != before.Title || public.ReadinessScore != before.ReadinessScore {
		t.Fatal("public snapshot changed before confirmation")
	}
	taskProcess(t, s)
	after, err := s.ConfirmTask(ctx, 1, task.ID, patched.Revision)
	if err != nil {
		t.Fatal(err)
	}
	if after.Title != title || after.SuccessCriteria != "" || after.ReadinessScore >= before.ReadinessScore {
		t.Fatal("empty field patch or rescoring failed")
	}
	if _, err = s.PatchTask(ctx, 1, task.ID, application.DraftPatch{Revision: task.Revision, Title: &title}); !errors.Is(err, domain.ErrConflict) {
		t.Fatal("stale revision should conflict")
	}
	if err = r.Migrate(ctx); err != nil {
		t.Fatal("migration must be idempotent", err)
	}
	if err = r.SeedDemo(ctx); err != nil {
		t.Fatal(err)
	}
	users, _ := s.Users(ctx)
	if len(users) != 3 {
		t.Fatal("demo reseed duplicated identities")
	}
}

type failedAI struct{}

func (failedAI) Source() string { return "openai" }
func (failedAI) Generate(context.Context, string, domain.AIInput) (domain.AIResult, error) {
	return domain.AIResult{}, errors.New("secret provider detail must not leak")
}
func TestFailedAIAndExplicitRetry(t *testing.T) {
	r := testRepo(t)
	ctx := context.Background()
	s := application.New(r, failedAI{})
	task, err := s.CreateTask(ctx, 1, application.CreateTaskInput{RawDescription: "Проблема бизнеса"})
	if err != nil {
		t.Fatal(err)
	}
	taskProcess(t, s)
	failed := taskGet(t, s, task.ID)
	if failed.AIStatus != "failed" || failed.RawDescription == "" || strings.Contains(failed.AIError, "secret") {
		t.Fatal("failure was not safely persisted")
	}
	good := application.New(r, ai.NewFallback())
	if _, err = good.RetryAI(ctx, 1, task.ID); err != nil {
		t.Fatal(err)
	}
	taskProcess(t, good)
	done := taskGet(t, good, task.ID)
	if done.AIStatus != "succeeded" || done.DraftEvaluation.Source != "fallback" {
		t.Fatal("retry did not work")
	}
}

type blockingAI struct{ started, release chan struct{} }

func (*blockingAI) Source() string { return "fallback" }
func (b *blockingAI) Generate(ctx context.Context, kind string, in domain.AIInput) (domain.AIResult, error) {
	close(b.started)
	select {
	case <-ctx.Done():
		return domain.AIResult{}, ctx.Err()
	case <-b.release:
		return ai.NewFallback().Generate(ctx, kind, in)
	}
}
func TestStaleAIResultCannotOverwriteNewRevision(t *testing.T) {
	r := testRepo(t)
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	b := &blockingAI{make(chan struct{}), make(chan struct{})}
	s := application.New(r, b)
	task, err := s.CreateTask(ctx, 1, application.CreateTaskInput{RawDescription: "Первоначальная потребность"})
	if err != nil {
		t.Fatal(err)
	}
	done := make(chan error, 1)
	go func() { done <- s.ProcessNext(ctx) }()
	select {
	case <-b.started:
	case <-ctx.Done():
		t.Fatal(ctx.Err())
	}
	title := "Свежая версия"
	patched, err := s.PatchTask(ctx, 1, task.ID, application.DraftPatch{Revision: task.Revision, Title: &title})
	if err != nil {
		t.Fatal(err)
	}
	close(b.release)
	if err = <-done; err != nil {
		t.Fatal(err)
	}
	latest := taskGet(t, s, task.ID)
	if latest.Revision != patched.Revision || latest.DraftCard.Title != title || latest.DraftEvaluation != nil {
		t.Fatal("stale AI result overwrote draft")
	}
	fresh := application.New(r, ai.NewFallback())
	taskProcess(t, fresh)
	latest = taskGet(t, fresh, task.ID)
	if latest.AIStatus != "succeeded" || *latest.EvaluatedRevision != latest.Revision {
		t.Fatal("latest job was not evaluated")
	}
	jobs, err := s.Jobs(ctx, 1, task.ID)
	if err != nil || len(jobs) != 2 || jobs[1].Status != "superseded" {
		t.Fatalf("jobs: %+v, %v", jobs, err)
	}
}

func TestJobRecoveryAndCatalogFilters(t *testing.T) {
	r := testRepo(t)
	s := application.New(r, ai.NewFallback())
	ctx := context.Background()
	items, err := s.Catalog(ctx, ports.TaskFilter{Readiness: "draft", Limit: 100})
	if err != nil || len(items) != 1 || items[0].ReadinessScore != 20 {
		t.Fatalf("readiness filter: %v %v", items, err)
	}
	items, err = s.Catalog(ctx, ports.TaskFilter{Topic: "logistics", TagIDs: []int64{4, 6}, Limit: 100})
	if err != nil || len(items) != 1 || items[0].ReadinessScore != 100 {
		t.Fatal("catalog filter failed", err)
	}
	task, err := s.CreateTask(ctx, 1, application.CreateTaskInput{RawDescription: "Задача после перезапуска"})
	if err != nil {
		t.Fatal(err)
	}
	if err = r.db.Model(&domain.AIJob{}).Where("task_id = ?", task.ID).Updates(map[string]any{"status": "running", "lease_token": "crashed", "updated_at": time.Now().Add(-6 * time.Minute)}).Error; err != nil {
		t.Fatal(err)
	}
	taskProcess(t, s)
	if taskGet(t, s, task.ID).AIStatus != "succeeded" {
		t.Fatal("expired job not recovered")
	}
}

type invalidAI struct{}

func (invalidAI) Source() string { return "openai" }
func (invalidAI) Generate(ctx context.Context, kind string, in domain.AIInput) (domain.AIResult, error) {
	result, err := ai.NewFallback().Generate(ctx, kind, in)
	if kind == "questions" {
		result.Questions[0].FieldKey = "invented_field"
	}
	if kind == "generate" {
		result.Card.TagIDs = []int64{999999}
	}
	return result, err
}
func TestInvalidAIAndClosedTaskBecomeTerminal(t *testing.T) {
	r := testRepo(t)
	ctx := context.Background()
	s := application.New(r, invalidAI{})
	task, err := s.CreateTask(ctx, 1, application.CreateTaskInput{RawDescription: "Исходный текст"})
	if err != nil {
		t.Fatal(err)
	}
	taskProcess(t, s)
	if taskGet(t, s, task.ID).AIStatus != "failed" {
		t.Fatal("invalid questions must fail instead of leasing forever")
	}
	s = application.New(r, ai.NewFallback())
	if _, err = s.RetryAI(ctx, 1, task.ID); err != nil {
		t.Fatal(err)
	}
	taskProcess(t, s)
	qs, err := s.Questions(ctx, 1, task.ID)
	if err != nil {
		t.Fatal(err)
	}
	answers := []application.Answer{}
	for _, q := range qs {
		answers = append(answers, application.Answer{QuestionID: q.ID, Answer: "Известные данные"})
	}
	task, err = s.AnswerQuestions(ctx, 1, task.ID, application.AnswersInput{Revision: task.Revision, Answers: answers})
	if err != nil {
		t.Fatal(err)
	}
	taskProcess(t, application.New(r, invalidAI{}))
	if taskGet(t, s, task.ID).AIStatus != "failed" {
		t.Fatal("invented tags must persist failed status")
	}
	if _, err = s.RetryAI(ctx, 1, task.ID); err != nil {
		t.Fatal(err)
	}
	if _, err = s.CancelTask(ctx, 1, task.ID); err != nil {
		t.Fatal(err)
	}
	taskProcess(t, s)
	closed := taskGet(t, s, task.ID)
	if closed.AIStatus == "pending" || closed.AIStatus == "running" {
		t.Fatal("closed task retained running status")
	}
}

func TestRawEditUpdatesUncuratedContextAndReadsAreConsistent(t *testing.T) {
	r := testRepo(t)
	ctx := context.Background()
	s := application.New(r, ai.NewFallback())
	task, err := s.CreateTask(ctx, 1, application.CreateTaskInput{RawDescription: "Первый текст"})
	if err != nil {
		t.Fatal(err)
	}
	newRaw := "Уточнённое описание"
	task, err = s.PatchTask(ctx, 1, task.ID, application.DraftPatch{Revision: task.Revision, RawDescription: &newRaw})
	if err != nil {
		t.Fatal(err)
	}
	if task.DraftCard.Context != newRaw {
		t.Fatal("raw changed without updating initial context")
	}
	curated := "Отредактированный контекст"
	task, err = s.PatchTask(ctx, 1, task.ID, application.DraftPatch{Revision: task.Revision, Context: &curated})
	if err != nil {
		t.Fatal(err)
	}
	newRaw = "Следующий текст"
	task, err = s.PatchTask(ctx, 1, task.ID, application.DraftPatch{Revision: task.Revision, RawDescription: &newRaw})
	if err != nil {
		t.Fatal(err)
	}
	if task.DraftCard.Context != curated {
		t.Fatal("raw edit destroyed curated context")
	}
	err = r.Read(ctx, func(reader ports.Store) error {
		before, err := reader.Task(1, false)
		if err != nil {
			return err
		}
		if err = r.Transact(ctx, func(writer ports.Store) error {
			current, err := writer.Task(1, true)
			if err != nil {
				return err
			}
			current.Title = "Concurrent confirmation"
			if err = writer.SetTaskTags(1, []int64{1}); err != nil {
				return err
			}
			return writer.PutTask(current)
		}); err != nil {
			return err
		}
		after, err := reader.Task(1, false)
		if err != nil {
			return err
		}
		if before.Title != after.Title || len(after.TagIDs) != 2 || after.TagIDs[0] != 4 {
			t.Fatal("read mixed two committed snapshots")
		}
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
}
