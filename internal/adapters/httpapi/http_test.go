package httpapi

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
	"larda/internal/application"
	"larda/internal/domain"
	"larda/internal/ports"
)

type fakeRepository struct {
	ports.Store
	userError    error
	pingError    error
	publicTask   *domain.Task
	transactions int
}

func (r *fakeRepository) Read(_ context.Context, fn func(ports.Store) error) error { return fn(r) }
func (r *fakeRepository) Transact(_ context.Context, fn func(ports.Store) error) error {
	r.transactions++
	return fn(r)
}
func (r *fakeRepository) Ping(context.Context) error { return r.pingError }
func (r *fakeRepository) User(id int64, _ bool) (*domain.User, error) {
	if id == 2 {
		return &domain.User{Record: domain.Record{ID: 2}, Name: "Demo Student", Role: "student"}, nil
	}
	if id != 1 {
		return nil, domain.ErrNotFound
	}
	return &domain.User{Record: domain.Record{ID: 1}, Name: "Demo Business", Role: "business"}, nil
}
func (r *fakeRepository) Users() ([]domain.User, error) {
	if r.userError != nil {
		return nil, r.userError
	}
	return []domain.User{{Record: domain.Record{ID: 1}, Name: "Demo Business", Role: "business"}}, nil
}
func (r *fakeRepository) Task(id int64, _ bool) (*domain.Task, error) {
	if r.publicTask == nil || r.publicTask.ID != id {
		return nil, domain.ErrNotFound
	}
	copy := *r.publicTask
	return &copy, nil
}
func (r *fakeRepository) Tasks(ports.TaskFilter) ([]domain.Task, error) {
	if r.publicTask == nil {
		return []domain.Task{}, nil
	}
	return []domain.Task{*r.publicTask}, nil
}

func testRouter(repo *fakeRepository) *gin.Engine {
	gin.SetMode(gin.TestMode)
	return New(application.New(repo, nil), []string{"http://localhost:3000"})
}

func request(r http.Handler, method, path, body string, headers map[string]string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(method, path, strings.NewReader(body))
	for key, value := range headers {
		req.Header.Set(key, value)
	}
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	return rec
}

func TestRejectsInvalidInputBeforeMutation(t *testing.T) {
	for _, tc := range []struct {
		name, body, actor, contentType string
		status                         int
	}{
		{"missing actor", `{}`, "", "application/json", 400},
		{"invalid actor", `{}`, "-1", "application/json", 400},
		{"unknown actor", `{}`, "999", "application/json", 404},
		{"unknown field", `{"raw_description":"some task","owner_id":9}`, "1", "application/json", 400},
		{"trailing JSON", `{} {}`, "1", "application/json", 400},
		{"null", `null`, "1", "application/json", 400},
		{"array", `[]`, "1", "application/json", 400},
		{"wrong type", `{"raw_description":12}`, "1", "application/json", 400},
		{"wrong media type", `{}`, "1", "text/plain", 415},
		{"body too large", `{"raw_description":"` + strings.Repeat("x", maxBodyBytes) + `"}`, "1", "application/json", 413},
	} {
		t.Run(tc.name, func(t *testing.T) {
			repo := &fakeRepository{}
			response := request(testRouter(repo), http.MethodPost, "/api/v1/tasks", tc.body, map[string]string{"X-Demo-User-ID": tc.actor, "Content-Type": tc.contentType})
			if response.Code != tc.status {
				t.Fatalf("status = %d, want %d, body = %s", response.Code, tc.status, response.Body.String())
			}
			if !strings.Contains(response.Body.String(), `"error":{"code":`) {
				t.Fatalf("missing structured error: %s", response.Body.String())
			}
			if repo.transactions != 0 {
				t.Fatal("invalid input reached a transaction")
			}
		})
	}
}

func TestInternalErrorsAreSanitizedAndReadinessIsSeparate(t *testing.T) {
	repo := &fakeRepository{userError: errors.New("postgres password=supersecret localhost:5432"), pingError: errors.New("database supersecret")}
	r := testRouter(repo)
	for _, tc := range []struct {
		path   string
		status int
	}{{"/api/v1/users", 500}, {"/healthz", 503}, {"/readyz", 503}, {"/livez", 200}} {
		response := request(r, http.MethodGet, tc.path, "", nil)
		if response.Code != tc.status {
			t.Errorf("%s status=%d, want %d", tc.path, response.Code, tc.status)
		}
		if strings.Contains(response.Body.String(), "supersecret") {
			t.Errorf("%s leaks internal error", tc.path)
		}
	}
}

func TestCORSUsesExactConfiguredOrigins(t *testing.T) {
	r := testRouter(&fakeRepository{})
	for _, tc := range []struct {
		origin string
		status int
	}{{"http://localhost:3000", 204}, {"http://localhost:3000.evil.example", 403}, {"https://localhost:3000", 403}} {
		response := request(r, http.MethodOptions, "/api/v1/tasks", "", map[string]string{"Origin": tc.origin, "Access-Control-Request-Method": "POST"})
		if response.Code != tc.status {
			t.Errorf("origin %s: status=%d", tc.origin, response.Code)
		}
		if tc.status == 204 && response.Header().Get("Access-Control-Allow-Origin") != tc.origin {
			t.Fatal("approved origin missing in response")
		}
		if tc.status == 403 && response.Header().Get("Access-Control-Allow-Origin") != "" {
			t.Fatal("unapproved origin echoed")
		}
	}
}

func TestPublicTaskDoesNotLeakDraftOrRawInput(t *testing.T) {
	repo := &fakeRepository{publicTask: &domain.Task{
		Record: domain.Record{ID: 42}, OwnerID: 1,
		Card:           domain.Card{Title: "Published title"},
		RawDescription: "private-raw-secret", DraftCard: &domain.Card{Title: "private-draft-secret"},
		DraftEvaluation: &domain.Evaluation{Source: "private-evaluation-secret"},
		AIError:         "private-error-secret", PublicationStatus: "published", AIStatus: "failed", Revision: 2,
	}}
	r := testRouter(repo)
	for _, path := range []string{"/api/v1/tasks/42", "/api/v1/tasks"} {
		response := request(r, http.MethodGet, path, "", nil)
		if response.Code != 200 {
			t.Fatalf("%s status=%d body=%s", path, response.Code, response.Body.String())
		}
		if strings.Contains(response.Body.String(), "private-") {
			t.Fatalf("%s leaked private data: %s", path, response.Body.String())
		}
		if !strings.Contains(response.Body.String(), "Published title") {
			t.Fatalf("%s omitted published card", path)
		}
	}
}

func TestCatalogQueryValidation(t *testing.T) {
	r := testRouter(&fakeRepository{})
	for _, query := range []string{"limit=0", "limit=101", "offset=-1", "tag_ids=1,no", "readiness=unknown"} {
		response := request(r, http.MethodGet, "/api/v1/tasks?"+query, "", nil)
		if response.Code != 400 {
			t.Errorf("query %s: status=%d", query, response.Code)
		}
	}
}

func TestOtherUsersCannotReadUnpublishedTaskOrAIContent(t *testing.T) {
	repo := &fakeRepository{publicTask: &domain.Task{Record: domain.Record{ID: 42}, OwnerID: 1, PublicationStatus: "draft", RawDescription: "private-secret"}}
	r := testRouter(repo)
	for _, tc := range []struct {
		path   string
		status int
	}{
		{"/api/v1/tasks/42", 404},
		{"/api/v1/tasks/42/questions", 403},
		{"/api/v1/tasks/42/ai-jobs", 403},
	} {
		response := request(r, http.MethodGet, tc.path, "", map[string]string{"X-Demo-User-ID": "2"})
		if response.Code != tc.status {
			t.Errorf("%s: status=%d body=%s", tc.path, response.Code, response.Body.String())
		}
		if strings.Contains(response.Body.String(), "private-secret") {
			t.Errorf("%s exposed raw task", tc.path)
		}
	}
}
