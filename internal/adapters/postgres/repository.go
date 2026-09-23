package postgres

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"sort"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgconn"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
	"gorm.io/gorm/logger"
	"larda/internal/domain"
	"larda/internal/ports"
	"larda/migrations"
)

type Repository struct{ db *gorm.DB }
type store struct{ db *gorm.DB }

func Open(dsn string) (*Repository, error) {
	db, err := gorm.Open(postgres.Open(dsn), &gorm.Config{Logger: logger.Default.LogMode(logger.Silent)})
	if err != nil {
		return nil, err
	}
	sqlDB, err := db.DB()
	if err != nil {
		return nil, err
	}
	sqlDB.SetMaxOpenConns(15)
	sqlDB.SetMaxIdleConns(5)
	sqlDB.SetConnMaxLifetime(30 * time.Minute)
	return &Repository{db: db}, nil
}
func (r *Repository) Close() error {
	db, err := r.db.DB()
	if err != nil {
		return err
	}
	return db.Close()
}
func (r *Repository) Ping(ctx context.Context) error {
	db, err := r.db.DB()
	if err != nil {
		return err
	}
	return db.PingContext(ctx)
}
func (r *Repository) Read(ctx context.Context, fn func(ports.Store) error) error {
	// Related reads (card fields, score and tags) must represent one committed snapshot.
	return normalize(r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		return fn(&store{db: tx})
	}, &sql.TxOptions{Isolation: sql.LevelRepeatableRead, ReadOnly: true}))
}
func (r *Repository) Transact(ctx context.Context, fn func(ports.Store) error) error {
	return normalize(r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error { return fn(&store{db: tx}) }))
}
func normalize(err error) error {
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return domain.ErrNotFound
	}
	var pg *pgconn.PgError
	if errors.As(err, &pg) {
		switch pg.Code {
		case "23505", "40001", "40P01":
			return fmt.Errorf("%w: concurrent or duplicate operation", domain.ErrConflict)
		case "23503", "23514", "22001", "22003", "22021", "22P05":
			return fmt.Errorf("%w: database constraint", domain.ErrInvalid)
		}
	}
	return err
}
func locked(db *gorm.DB, lock bool) *gorm.DB {
	if lock {
		return db.Clauses(clause.Locking{Strength: "UPDATE"})
	}
	return db
}
func put(db *gorm.DB, value any) error {
	return normalize(db.Omit(clause.Associations).Save(value).Error)
}

// Migrate uses a database advisory lock and a ledger, and can adopt the existing initial SQL schema.
func (r *Repository) Migrate(ctx context.Context) error {
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Exec("SELECT pg_advisory_xact_lock(727341102)").Error; err != nil {
			return err
		}
		if err := tx.Exec("CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())").Error; err != nil {
			return err
		}
		entries, err := migrations.Files.ReadDir(".")
		if err != nil {
			return err
		}
		for _, entry := range entries {
			if !strings.HasSuffix(entry.Name(), ".up.sql") {
				continue
			}
			var count int64
			if err := tx.Table("schema_migrations").Where("name = ?", entry.Name()).Count(&count).Error; err != nil {
				return err
			}
			if count > 0 {
				continue
			}
			var exists bool
			if entry.Name() == "000001_init.up.sql" {
				if err := tx.Raw("SELECT to_regclass('tasks') IS NOT NULL").Scan(&exists).Error; err != nil {
					return err
				}
			}
			if !exists {
				body, err := migrations.Files.ReadFile(entry.Name())
				if err != nil {
					return err
				}
				if err = tx.Exec(string(body)).Error; err != nil {
					return fmt.Errorf("migration %s: %w", entry.Name(), err)
				}
			}
			if err := tx.Exec("INSERT INTO schema_migrations(name) VALUES (?)", entry.Name()).Error; err != nil {
				return err
			}
		}
		return nil
	})
}
func (s *store) User(id int64, lock bool) (*domain.User, error) {
	var u domain.User
	err := locked(s.db, lock).First(&u, id).Error
	return &u, normalize(err)
}
func (s *store) Users() ([]domain.User, error) {
	out := []domain.User{}
	err := s.db.Order("id").Find(&out).Error
	return out, normalize(err)
}
func (s *store) Tags() ([]domain.Tag, error) {
	out := []domain.Tag{}
	err := s.db.Order("id").Find(&out).Error
	return out, normalize(err)
}
func (s *store) UserTags(id int64) ([]domain.Tag, error) {
	out := []domain.Tag{}
	err := s.db.Table("tags").Joins("JOIN user_tags ON user_tags.tag_id = tags.id").Where("user_tags.user_id = ?", id).Order("tags.id").Find(&out).Error
	return out, normalize(err)
}
func (s *store) SetUserTags(id int64, ids []int64) error {
	return s.setTags("user_tags", "user_id", id, ids)
}
func (s *store) SetTaskTags(id int64, ids []int64) error {
	return s.setTags("task_tags", "task_id", id, ids)
}
func (s *store) setTags(table, key string, id int64, ids []int64) error {
	if err := s.db.Table(table).Where(key+" = ?", id).Delete(map[string]any{}).Error; err != nil {
		return normalize(err)
	}
	for _, tag := range ids {
		if err := s.db.Table(table).Create(map[string]any{key: id, "tag_id": tag}).Error; err != nil {
			return normalize(err)
		}
	}
	return nil
}
func (s *store) taskTags(t *domain.Task) error {
	t.TagIDs = []int64{}
	return s.db.Table("task_tags").Where("task_id = ?", t.ID).Order("tag_id").Pluck("tag_id", &t.TagIDs).Error
}
func (s *store) Task(id int64, lock bool) (*domain.Task, error) {
	var t domain.Task
	err := locked(s.db, lock).First(&t, id).Error
	if err == nil {
		err = s.taskTags(&t)
	}
	return &t, normalize(err)
}
func (s *store) PutTask(t *domain.Task) error { return put(s.db, t) }
func (s *store) Tasks(f ports.TaskFilter) ([]domain.Task, error) {
	q := s.db.Model(&domain.Task{})
	if f.PublishedOnly {
		q = q.Where("publication_status = 'published'")
	}
	if f.OwnerID > 0 {
		q = q.Where("owner_id = ?", f.OwnerID)
	}
	if f.Topic != "" {
		q = q.Where("topic = ?", f.Topic)
	}
	if f.Industry != "" {
		q = q.Where("industry = ?", f.Industry)
	}
	switch f.Readiness {
	case "draft":
		q = q.Where("readiness_score BETWEEN 0 AND 39")
	case "working":
		q = q.Where("readiness_score BETWEEN 40 AND 69")
	case "ready":
		q = q.Where("readiness_score BETWEEN 70 AND 89")
	case "priority":
		q = q.Where("readiness_score BETWEEN 90 AND 100")
	}
	for _, id := range f.TagIDs {
		q = q.Where("EXISTS (SELECT 1 FROM task_tags tt WHERE tt.task_id=tasks.id AND tt.tag_id=?)", id)
	}
	out := []domain.Task{}
	err := q.Order("readiness_score DESC, published_at DESC NULLS LAST, id DESC").Limit(f.Limit).Offset(f.Offset).Find(&out).Error
	if err != nil {
		return nil, normalize(err)
	}
	for i := range out {
		if err = s.taskTags(&out[i]); err != nil {
			return nil, normalize(err)
		}
	}
	return out, nil
}
func (s *store) Questions(task int64) ([]domain.TaskQuestion, error) {
	out := []domain.TaskQuestion{}
	err := s.db.Where("task_id = ?", task).Order("round_number, position").Find(&out).Error
	return out, normalize(err)
}
func (s *store) PutQuestion(q *domain.TaskQuestion) error { return put(s.db, q) }
func (s *store) Job(id int64, lock bool) (*domain.AIJob, error) {
	var j domain.AIJob
	err := locked(s.db, lock).First(&j, id).Error
	return &j, normalize(err)
}
func (s *store) PutJob(j *domain.AIJob) error { return put(s.db, j) }
func (s *store) Jobs(task int64) ([]domain.AIJob, error) {
	out := []domain.AIJob{}
	err := s.db.Where("task_id = ?", task).Order("id DESC").Limit(100).Find(&out).Error
	return out, normalize(err)
}
func (s *store) ClaimJob(token string) (*domain.AIJob, error) {
	var j domain.AIJob
	err := s.db.Clauses(clause.Locking{Strength: "UPDATE", Options: "SKIP LOCKED"}).Where("status = 'pending' OR (status = 'running' AND updated_at < ?)", time.Now().UTC().Add(-5*time.Minute)).Order("id").First(&j).Error
	if err != nil {
		return nil, normalize(err)
	}
	j.Status = "running"
	j.Attempts++
	j.LeaseToken = token
	err = s.PutJob(&j)
	return &j, err
}

func sortedUnique(ids []int64) []int64 {
	sort.Slice(ids, func(i, j int) bool { return ids[i] < ids[j] })
	out := []int64{}
	for _, id := range ids {
		if len(out) == 0 || out[len(out)-1] != id {
			out = append(out, id)
		}
	}
	return out
}
