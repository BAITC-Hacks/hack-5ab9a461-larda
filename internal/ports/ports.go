// Package ports defines the application boundary. Adapters implement these interfaces.
package ports

import (
	"context"
	"hackalem/internal/domain"
)

type TaskFilter struct {
	OwnerID                    int64
	Topic, Industry, Readiness string
	TagIDs                     []int64
	Limit, Offset              int
	PublishedOnly              bool
}

type Repository interface {
	Read(context.Context, func(Store) error) error
	Transact(context.Context, func(Store) error) error
	Ping(context.Context) error
}

// Store is scoped to a context/transaction. Lock=true must only be used within Transact.
type Store interface {
	User(int64, bool) (*domain.User, error)
	Users() ([]domain.User, error)
	Tags() ([]domain.Tag, error)
	UserTags(int64) ([]domain.Tag, error)
	SetUserTags(int64, []int64) error
	Task(int64, bool) (*domain.Task, error)
	Tasks(TaskFilter) ([]domain.Task, error)
	PutTask(*domain.Task) error
	SetTaskTags(int64, []int64) error
	Questions(int64) ([]domain.TaskQuestion, error)
	PutQuestion(*domain.TaskQuestion) error
	Job(int64, bool) (*domain.AIJob, error)
	PutJob(*domain.AIJob) error
	Jobs(int64) ([]domain.AIJob, error)
	ClaimJob(string) (*domain.AIJob, error)
	Team(int64, bool) (*domain.Team, error)
	Teams() ([]domain.Team, error)
	PutTeam(*domain.Team) error
	Members(int64) ([]domain.TeamMember, error)
	PutMember(*domain.TeamMember) error
	DeleteMember(int64, int64) error
	Proposal(int64, bool) (*domain.Proposal, error)
	Proposals(int64, int64) ([]domain.Proposal, error)
	PutProposal(*domain.Proposal) error
	Milestone(int64, bool) (*domain.Milestone, error)
	Milestones(int64) ([]domain.Milestone, error)
	PutMilestone(*domain.Milestone) error
	Achievements() ([]domain.Achievement, error)
	UserAchievements(int64) ([]domain.UserAchievement, error)
	Unlock(*domain.UserAchievement) (bool, error)
	AddExp(*domain.ExpTransaction) (bool, error)
	ExpHistory(int64) ([]domain.ExpTransaction, error)
	EventCount(int64, string, string) (int64, error)
}

type AI interface {
	Generate(context.Context, string, domain.AIInput) (domain.AIResult, error)
	Source() string
}
