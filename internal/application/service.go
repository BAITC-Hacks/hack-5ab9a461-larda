// Package application implements use cases against ports, independent of Gin, GORM and OpenAI.
package application

import (
	"context"
	"fmt"
	"hackalem/internal/domain"
	"hackalem/internal/ports"
	"time"
)

type Service struct {
	repo ports.Repository
	ai   ports.AI
}

func New(repo ports.Repository, ai ports.AI) *Service { return &Service{repo: repo, ai: ai} }
func (s *Service) Health(ctx context.Context) error   { return s.repo.Ping(ctx) }
func (s *Service) Users(ctx context.Context) (out []domain.User, err error) {
	err = s.repo.Read(ctx, func(r ports.Store) error { out, err = r.Users(); return err })
	return
}
func (s *Service) Tags(ctx context.Context) (out []domain.Tag, err error) {
	err = s.repo.Read(ctx, func(r ports.Store) error { out, err = r.Tags(); return err })
	return
}
func (s *Service) User(ctx context.Context, id int64) (out *domain.User, err error) {
	err = s.repo.Read(ctx, func(r ports.Store) error { out, err = r.User(id, false); return err })
	return
}

type Profile struct {
	User         *domain.User             `json:"user"`
	Tags         []domain.Tag             `json:"tags"`
	Achievements []domain.UserAchievement `json:"achievements"`
	ExpHistory   []domain.ExpTransaction  `json:"exp_history"`
}

func (s *Service) Profile(ctx context.Context, id int64) (out Profile, err error) {
	err = s.repo.Read(ctx, func(r ports.Store) error {
		out.User, err = r.User(id, false)
		if err != nil {
			return err
		}
		out.Tags, err = r.UserTags(id)
		if err != nil {
			return err
		}
		out.Achievements, err = r.UserAchievements(id)
		if err != nil {
			return err
		}
		out.ExpHistory, err = r.ExpHistory(id)
		return err
	})
	return
}
func (s *Service) Achievements(ctx context.Context) (out []domain.Achievement, err error) {
	err = s.repo.Read(ctx, func(r ports.Store) error { out, err = r.Achievements(); return err })
	return
}
func actor(r ports.Store, id int64, role string) (*domain.User, error) {
	u, err := r.User(id, false)
	if err != nil {
		return nil, err
	}
	if role != "" && u.Role != role {
		return nil, domain.ErrForbidden
	}
	return u, nil
}
func owned(r ports.Store, actorID, taskID int64) (*domain.Task, error) {
	if _, err := actor(r, actorID, "business"); err != nil {
		return nil, err
	}
	t, err := r.Task(taskID, true)
	if err != nil {
		return nil, err
	}
	if t.OwnerID != actorID {
		return nil, domain.ErrForbidden
	}
	return t, nil
}
func editable(t *domain.Task) error {
	if t.ExecutionStatus == "completed" || t.ExecutionStatus == "cancelled" {
		return fmt.Errorf("%w: task is closed", domain.ErrConflict)
	}
	return nil
}
func now() time.Time { return time.Now().UTC() }
