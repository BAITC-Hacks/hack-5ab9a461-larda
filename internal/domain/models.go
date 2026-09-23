// Package domain contains the platform's entities and rules, without framework dependencies.
package domain

import "time"

type Record struct {
	ID        int64     `json:"id"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

type User struct {
	Record
	Name        string  `json:"name"`
	Role        string  `json:"role"`
	CompanyName *string `json:"company_name"`
	Exp         int64   `json:"exp"`
}

type Tag struct {
	Record
	Slug string `json:"slug"`
	Name string `json:"name"`
	Kind string `json:"kind"`
}

type Card struct {
	Industry          string  `json:"industry"`
	Topic             string  `json:"topic"`
	Title             string  `json:"title"`
	Context           string  `json:"context"`
	Need              string  `json:"need"`
	TargetUsers       string  `json:"target_users"`
	AvailableData     string  `json:"available_data"`
	Constraints       string  `json:"constraints"`
	ExpectedResult    string  `json:"expected_result"`
	SuccessCriteria   string  `json:"success_criteria"`
	Contact           string  `json:"contact"`
	InteractionFormat string  `json:"interaction_format"`
	FeedbackProcess   string  `json:"feedback_process"`
	TagIDs            []int64 `json:"tag_ids" gorm:"-"`
}

type Criterion struct {
	Key     string   `json:"key"`
	Score   int      `json:"score"`
	Reason  string   `json:"reason"`
	Missing []string `json:"missing"`
}

type Evaluation struct {
	Score    int         `json:"score"`
	Criteria []Criterion `json:"criteria"`
	Missing  []string    `json:"missing"`
	Source   string      `json:"source"`
}

type Task struct {
	Record
	OwnerID           int64 `json:"owner_id"`
	Card              `gorm:"embedded"`
	RawDescription    string      `json:"raw_description"`
	DraftCard         *Card       `json:"draft_card" gorm:"serializer:json;type:jsonb"`
	DraftEvaluation   *Evaluation `json:"draft_evaluation" gorm:"serializer:json;type:jsonb"`
	Revision          int64       `json:"revision"`
	EvaluatedRevision *int64      `json:"evaluated_revision"`
	AIStatus          string      `json:"ai_status"`
	AIError           string      `json:"ai_error"`
	PublicationStatus string      `json:"publication_status"`
	ReadinessScore    int         `json:"readiness_score"`
	ScoreBreakdown    Evaluation  `json:"score_breakdown" gorm:"serializer:json;type:jsonb"`
	ConfirmedAt       *time.Time  `json:"confirmed_at"`
	PublishedAt       *time.Time  `json:"published_at"`
	ExecutionStatus   string      `json:"execution_status"`
	TeamExpReward     int64       `json:"team_exp_reward"`
	BusinessExpReward int64       `json:"business_exp_reward"`
	CompletedAt       *time.Time  `json:"completed_at"`
}

type TaskQuestion struct {
	Record
	TaskID      int64   `json:"task_id"`
	RoundNumber int     `json:"round_number"`
	Position    int     `json:"position"`
	FieldKey    string  `json:"field_key"`
	Question    string  `json:"question"`
	Answer      *string `json:"answer"`
}

type AIJob struct {
	Record
	TaskID     int64     `json:"task_id"`
	Revision   int64     `json:"revision"`
	Kind       string    `json:"kind"`
	Status     string    `json:"status"`
	Attempts   int       `json:"attempts"`
	Error      string    `json:"error"`
	Input      AIInput   `json:"input" gorm:"serializer:json;type:jsonb"`
	Result     *AIResult `json:"result" gorm:"serializer:json;type:jsonb"`
	LeaseToken string    `json:"-"`
}

type AIInput struct {
	RawDescription string         `json:"raw_description"`
	Card           Card           `json:"card"`
	Questions      []TaskQuestion `json:"questions"`
}

type AIResult struct {
	Questions  []TaskQuestion `json:"questions"`
	Card       *Card          `json:"card"`
	Evaluation Evaluation     `json:"evaluation"`
}

type Team struct {
	Record
	Name        string       `json:"name"`
	Description string       `json:"description"`
	Interests   []string     `json:"interests" gorm:"serializer:json;type:jsonb"`
	Members     []TeamMember `json:"members" gorm:"-"`
	Tags        []Tag        `json:"tags" gorm:"-"`
}

type TeamMember struct {
	TeamID   int64     `json:"team_id" gorm:"primaryKey"`
	UserID   int64     `json:"user_id" gorm:"primaryKey"`
	Role     string    `json:"role"`
	JoinedAt time.Time `json:"joined_at"`
}

type Proposal struct {
	Record
	TaskID          int64       `json:"task_id"`
	TeamID          int64       `json:"team_id"`
	SubmittedBy     int64       `json:"submitted_by"`
	SolutionIdea    string      `json:"solution_idea"`
	Plan            string      `json:"plan"`
	DurationDays    int         `json:"duration_days"`
	PrototypeURL    string      `json:"prototype_url"`
	Status          string      `json:"status"`
	DecidedBy       *int64      `json:"decided_by"`
	DecidedAt       *time.Time  `json:"decided_at"`
	ExecutionStatus string      `json:"execution_status"`
	CompletedAt     *time.Time  `json:"completed_at"`
	Milestones      []Milestone `json:"milestones" gorm:"-"`
}

type Milestone struct {
	Record
	ProposalID  int64      `json:"proposal_id"`
	Position    int        `json:"position"`
	Title       string     `json:"title"`
	Description string     `json:"description"`
	ExpReward   int64      `json:"exp_reward"`
	Status      string     `json:"status"`
	ResultURL   *string    `json:"result_url"`
	SubmittedAt *time.Time `json:"submitted_at"`
	CompletedBy *int64     `json:"completed_by"`
	CompletedAt *time.Time `json:"completed_at"`
	ProposedBy  int64      `json:"proposed_by"`
	ApprovedBy  *int64     `json:"approved_by"`
	ApprovedAt  *time.Time `json:"approved_at"`
}

type Achievement struct {
	Record
	Code        string `json:"code"`
	Title       string `json:"title"`
	Description string `json:"description"`
	RoleScope   string `json:"role_scope"`
	EventType   string `json:"event_type"`
	TargetCount int    `json:"target_count"`
	ExpReward   int64  `json:"exp_reward"`
	IsActive    bool   `json:"is_active"`
}

type UserAchievement struct {
	UserID        int64     `json:"user_id" gorm:"primaryKey"`
	AchievementID int64     `json:"achievement_id" gorm:"primaryKey"`
	UnlockedAt    time.Time `json:"unlocked_at"`
}

type ExpTransaction struct {
	ID            int64     `json:"id"`
	UserID        int64     `json:"user_id"`
	Amount        int64     `json:"amount"`
	Reason        string    `json:"reason"`
	MilestoneID   *int64    `json:"milestone_id"`
	TaskID        *int64    `json:"task_id"`
	TeamID        *int64    `json:"team_id"`
	AchievementID *int64    `json:"achievement_id"`
	CreatedAt     time.Time `json:"created_at"`
}
