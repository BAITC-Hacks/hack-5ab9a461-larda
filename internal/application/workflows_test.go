package application

import (
	"context"
	"errors"
	"fmt"
	"reflect"
	"sort"
	"testing"

	"hackalem/internal/domain"
	"hackalem/internal/ports"
)

// Embed the port so an unexpected dependency fails the test instead of being
// silently implemented by a permissive mock.
type workflowStore struct {
	ports.Store
	users        map[int64]domain.User
	tasks        map[int64]domain.Task
	teams        map[int64]domain.Team
	members      map[int64][]domain.TeamMember
	proposals    map[int64]domain.Proposal
	milestones   map[int64]domain.Milestone
	achievements []domain.Achievement
	unlocks      map[string]bool
	ledger       []domain.ExpTransaction
	locks        []string
}
type workflowRepo struct{ store *workflowStore }

func (r workflowRepo) Read(_ context.Context, f func(ports.Store) error) error     { return f(r.store) }
func (r workflowRepo) Transact(_ context.Context, f func(ports.Store) error) error { return f(r.store) }
func (r workflowRepo) Ping(context.Context) error                                  { return nil }
func (r *workflowStore) User(id int64, lock bool) (*domain.User, error) {
	v, ok := r.users[id]
	if !ok {
		return nil, domain.ErrNotFound
	}
	if lock {
		r.locks = append(r.locks, fmt.Sprintf("user:%d", id))
	}
	return &v, nil
}
func (r *workflowStore) Task(id int64, lock bool) (*domain.Task, error) {
	v, ok := r.tasks[id]
	if !ok {
		return nil, domain.ErrNotFound
	}
	if lock {
		r.locks = append(r.locks, fmt.Sprintf("task:%d", id))
	}
	return &v, nil
}
func (r *workflowStore) Team(id int64, lock bool) (*domain.Team, error) {
	v, ok := r.teams[id]
	if !ok {
		return nil, domain.ErrNotFound
	}
	if lock {
		r.locks = append(r.locks, fmt.Sprintf("team:%d", id))
	}
	return &v, nil
}
func (r *workflowStore) Members(id int64) ([]domain.TeamMember, error) {
	return append([]domain.TeamMember{}, r.members[id]...), nil
}
func (r *workflowStore) UserTags(int64) ([]domain.Tag, error) { return []domain.Tag{}, nil }
func (r *workflowStore) PutMember(v *domain.TeamMember) error {
	for i, m := range r.members[v.TeamID] {
		if m.UserID == v.UserID {
			r.members[v.TeamID][i] = *v
			return nil
		}
	}
	r.members[v.TeamID] = append(r.members[v.TeamID], *v)
	return nil
}
func (r *workflowStore) DeleteMember(teamID, userID int64) error {
	for i, m := range r.members[teamID] {
		if m.UserID == userID {
			r.members[teamID] = append(r.members[teamID][:i], r.members[teamID][i+1:]...)
			break
		}
	}
	return nil
}
func (r *workflowStore) Proposal(id int64, lock bool) (*domain.Proposal, error) {
	v, ok := r.proposals[id]
	if !ok {
		return nil, domain.ErrNotFound
	}
	if lock {
		r.locks = append(r.locks, fmt.Sprintf("proposal:%d", id))
	}
	return &v, nil
}
func (r *workflowStore) Proposals(taskID, teamID int64) ([]domain.Proposal, error) {
	out := []domain.Proposal{}
	for _, v := range r.proposals {
		if (taskID == 0 || v.TaskID == taskID) && (teamID == 0 || v.TeamID == teamID) {
			out = append(out, v)
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i].ID < out[j].ID })
	return out, nil
}
func (r *workflowStore) Milestone(id int64, lock bool) (*domain.Milestone, error) {
	v, ok := r.milestones[id]
	if !ok {
		return nil, domain.ErrNotFound
	}
	if lock {
		r.locks = append(r.locks, fmt.Sprintf("milestone:%d", id))
	}
	return &v, nil
}
func (r *workflowStore) Milestones(proposalID int64) ([]domain.Milestone, error) {
	out := []domain.Milestone{}
	for _, v := range r.milestones {
		if v.ProposalID == proposalID {
			out = append(out, v)
		}
	}
	return out, nil
}
func (r *workflowStore) PutTask(v *domain.Task) error { r.tasks[v.ID] = *v; return nil }
func (r *workflowStore) PutProposal(v *domain.Proposal) error {
	if v.ID == 0 {
		v.ID = int64(len(r.proposals) + 1)
	}
	r.proposals[v.ID] = *v
	return nil
}
func (r *workflowStore) PutMilestone(v *domain.Milestone) error {
	if v.ID == 0 {
		v.ID = int64(len(r.milestones) + 1)
	}
	r.milestones[v.ID] = *v
	return nil
}
func (r *workflowStore) Achievements() ([]domain.Achievement, error) { return r.achievements, nil }
func (r *workflowStore) Unlock(v *domain.UserAchievement) (bool, error) {
	key := fmt.Sprintf("%d/%d", v.UserID, v.AchievementID)
	if r.unlocks[key] {
		return false, nil
	}
	r.unlocks[key] = true
	return true, nil
}
func pointerValue(v *int64) int64 {
	if v == nil {
		return 0
	}
	return *v
}
func ledgerKey(v domain.ExpTransaction) string {
	return fmt.Sprintf("%d/%s/%d/%d/%d/%d", v.UserID, v.Reason, pointerValue(v.MilestoneID), pointerValue(v.TaskID), pointerValue(v.TeamID), pointerValue(v.AchievementID))
}
func (r *workflowStore) AddExp(v *domain.ExpTransaction) (bool, error) {
	for _, old := range r.ledger {
		if ledgerKey(old) == ledgerKey(*v) {
			return false, nil
		}
	}
	r.ledger = append(r.ledger, *v)
	u := r.users[v.UserID]
	u.Exp += v.Amount
	r.users[v.UserID] = u
	return true, nil
}
func (r *workflowStore) EventCount(id int64, role, event string) (int64, error) {
	ids := map[int64]bool{}
	if role == "student" {
		for _, v := range r.ledger {
			if v.UserID != id {
				continue
			}
			if event == "milestone_completed" && v.Reason == "milestone_completed" {
				ids[*v.MilestoneID] = true
			}
			if event == "task_completed" && v.Reason == "team_task_completed" {
				ids[*v.TaskID] = true
			}
		}
	} else {
		for _, v := range r.tasks {
			if v.OwnerID == id && ((event == "task_completed" && v.ExecutionStatus == "completed") || (event == "task_published" && v.PublishedAt != nil)) {
				ids[v.ID] = true
			}
		}
	}
	return int64(len(ids)), nil
}
func fixture() (*Service, *workflowStore) {
	r := &workflowStore{users: map[int64]domain.User{}, tasks: map[int64]domain.Task{}, teams: map[int64]domain.Team{}, members: map[int64][]domain.TeamMember{}, proposals: map[int64]domain.Proposal{}, milestones: map[int64]domain.Milestone{}, unlocks: map[string]bool{}}
	for id := int64(1); id <= 5; id++ {
		role := "student"
		if id == 1 {
			role = "business"
		}
		r.users[id] = domain.User{Record: domain.Record{ID: id}, Role: role}
	}
	r.tasks[1] = domain.Task{Record: domain.Record{ID: 1}, OwnerID: 1, PublicationStatus: "published", ExecutionStatus: "in_progress", TeamExpReward: 100, BusinessExpReward: 50}
	r.teams[1] = domain.Team{Record: domain.Record{ID: 1}}
	r.members[1] = []domain.TeamMember{{TeamID: 1, UserID: 4, Role: "member"}, {TeamID: 1, UserID: 2, Role: "captain"}, {TeamID: 1, UserID: 3, Role: "member"}}
	r.proposals[1] = domain.Proposal{Record: domain.Record{ID: 1}, TaskID: 1, TeamID: 1, Status: "accepted", ExecutionStatus: "in_progress"}
	stamp := now()
	owner := int64(1)
	r.milestones[1] = domain.Milestone{Record: domain.Record{ID: 1}, ProposalID: 1, Position: 1, Title: "Prototype", Status: "submitted", ExpReward: 100, ApprovedBy: &owner, ApprovedAt: &stamp, SubmittedAt: &stamp}
	return New(workflowRepo{r}, nil), r
}
func TestMilestonePaysCurrentMembersOnceAndCountsZeroShares(t *testing.T) {
	s, r := fixture()
	m := r.milestones[1]
	m.ExpReward = 1
	r.milestones[1] = m
	r.achievements = []domain.Achievement{{Record: domain.Record{ID: 1}, RoleScope: "student", EventType: "milestone_completed", TargetCount: 1, ExpReward: 50, IsActive: true}}
	if _, err := s.ReviewMilestone(context.Background(), 1, 1, true); err != nil {
		t.Fatal(err)
	}
	if len(r.ledger) != 6 {
		t.Fatalf("ledger rows=%d, want three shares and three achievements", len(r.ledger))
	}
	for id, want := range map[int64]int64{2: 51, 3: 50, 4: 50} {
		if r.users[id].Exp != want {
			t.Errorf("user %d exp=%d want %d", id, r.users[id].Exp, want)
		}
	}
	wantLocks := []string{"task:1", "team:1", "proposal:1", "milestone:1", "user:1", "user:2", "user:3", "user:4"}
	if !reflect.DeepEqual(r.locks, wantLocks) {
		t.Errorf("locks=%v want %v", r.locks, wantLocks)
	}
	r.members[1] = []domain.TeamMember{{TeamID: 1, UserID: 5, Role: "captain"}}
	if _, err := s.ReviewMilestone(context.Background(), 1, 1, true); err != nil {
		t.Fatal(err)
	}
	if len(r.ledger) != 6 || r.users[5].Exp != 0 {
		t.Fatal("retry redistributed historical reward")
	}
}
func TestTaskCompletionDistinctTeamsAndOneTimeAchievements(t *testing.T) {
	s, r := fixture()
	r.members[1] = []domain.TeamMember{{TeamID: 1, UserID: 2, Role: "captain"}, {TeamID: 1, UserID: 3, Role: "member"}, {TeamID: 1, UserID: 4, Role: "member"}}
	r.teams[2] = domain.Team{Record: domain.Record{ID: 2}}
	r.members[2] = []domain.TeamMember{{TeamID: 2, UserID: 2, Role: "captain"}, {TeamID: 2, UserID: 3, Role: "member"}}
	for id, team := range map[int64]int64{1: 1, 2: 1, 3: 2} {
		r.proposals[id] = domain.Proposal{Record: domain.Record{ID: id}, TaskID: 1, TeamID: team, Status: "accepted", ExecutionStatus: "completed"}
	}
	r.achievements = []domain.Achievement{{Record: domain.Record{ID: 1}, RoleScope: "student", EventType: "task_completed", TargetCount: 1, ExpReward: 100, IsActive: true}, {Record: domain.Record{ID: 2}, RoleScope: "student", EventType: "task_completed", TargetCount: 2, ExpReward: 500, IsActive: true}, {Record: domain.Record{ID: 3}, RoleScope: "business", EventType: "task_completed", TargetCount: 1, ExpReward: 100, IsActive: true}}
	if _, err := s.CompleteTask(context.Background(), 1, 1); err != nil {
		t.Fatal(err)
	}
	for id, want := range map[int64]int64{1: 150, 2: 184, 3: 183, 4: 133} {
		if r.users[id].Exp != want {
			t.Errorf("user %d exp=%d want %d", id, r.users[id].Exp, want)
		}
	}
	if len(r.ledger) != 10 {
		t.Fatalf("ledger rows=%d want 10", len(r.ledger))
	}
	wantLocks := []string{"task:1", "team:1", "team:2", "user:1", "user:2", "user:3", "user:4"}
	if !reflect.DeepEqual(r.locks, wantLocks) {
		t.Errorf("lock order=%v", r.locks)
	}
	r.members[1] = append(r.members[1], domain.TeamMember{TeamID: 1, UserID: 5, Role: "member"})
	if _, err := s.CompleteTask(context.Background(), 1, 1); err != nil {
		t.Fatal(err)
	}
	if len(r.ledger) != 10 || r.users[5].Exp != 0 {
		t.Fatal("task retry changed payouts")
	}
}
func TestTaskCannotCompleteWhileAcceptedWorkIsActive(t *testing.T) {
	s, r := fixture()
	if _, err := s.CompleteTask(context.Background(), 1, 1); !errors.Is(err, domain.ErrConflict) {
		t.Fatalf("got %v", err)
	}
	if len(r.ledger) != 0 || r.tasks[1].ExecutionStatus != "in_progress" {
		t.Fatal("failed completion changed state")
	}
}
func TestLowReadinessPublishedTaskAcceptsOnlyCaptainProposal(t *testing.T) {
	s, r := fixture()
	in := ProposalInput{TeamID: 1, SolutionIdea: "Build a prototype", Plan: "Research and deliver", DurationDays: 10}
	if _, err := s.SubmitProposal(context.Background(), 3, 1, in); !errors.Is(err, domain.ErrForbidden) {
		t.Fatalf("member submit: %v", err)
	}
	p, err := s.SubmitProposal(context.Background(), 2, 1, in)
	if err != nil {
		t.Fatal(err)
	}
	if p.Status != "pending" || r.tasks[1].ReadinessScore != 0 {
		t.Fatal("unexpected score gate or proposal state")
	}
}
func TestMilestoneDefinitionNeedsOwnerApprovalAndCaptainSubmission(t *testing.T) {
	s, r := fixture()
	m := r.milestones[1]
	m.Status = "pending"
	m.ApprovedAt = nil
	m.ApprovedBy = nil
	r.milestones[1] = m
	if _, err := s.SubmitMilestone(context.Background(), 2, 1, "https://example.com/result"); !errors.Is(err, domain.ErrConflict) {
		t.Fatalf("unapproved submission: %v", err)
	}
	if _, err := s.ApproveMilestone(context.Background(), 2, 1); !errors.Is(err, domain.ErrForbidden) {
		t.Fatalf("captain approval: %v", err)
	}
	if _, err := s.ApproveMilestone(context.Background(), 1, 1); err != nil {
		t.Fatal(err)
	}
	if _, err := s.SubmitMilestone(context.Background(), 3, 1, "https://example.com/result"); !errors.Is(err, domain.ErrForbidden) {
		t.Fatalf("member submission: %v", err)
	}
	if _, err := s.SubmitMilestone(context.Background(), 2, 1, "https://example.com/result"); err != nil {
		t.Fatal(err)
	}
	if _, err := s.ReviewMilestone(context.Background(), 2, 1, true); !errors.Is(err, domain.ErrForbidden) {
		t.Fatalf("captain acceptance: %v", err)
	}
	if _, err := s.ReviewMilestone(context.Background(), 1, 1, false); err != nil {
		t.Fatal(err)
	}
	if _, err := s.SubmitMilestone(context.Background(), 2, 1, "https://example.com/revised"); err != nil {
		t.Fatal(err)
	}
}
func TestCaptainTransferMaintainsCaptainAndPreventsSelfRemoval(t *testing.T) {
	s, r := fixture()
	if _, err := s.RemoveMember(context.Background(), 2, 1, 2); !errors.Is(err, domain.ErrConflict) {
		t.Fatalf("remove captain: %v", err)
	}
	if _, err := s.TransferCaptain(context.Background(), 2, 1, 3); err != nil {
		t.Fatal(err)
	}
	count := 0
	for _, m := range r.members[1] {
		if m.Role == "captain" {
			count++
			if m.UserID != 3 {
				t.Fatal("wrong new captain")
			}
		}
	}
	if count != 1 {
		t.Fatalf("captains=%d", count)
	}
	if _, err := s.RemoveMember(context.Background(), 2, 1, 4); !errors.Is(err, domain.ErrForbidden) {
		t.Fatalf("old captain retained permission: %v", err)
	}
	if _, err := s.RemoveMember(context.Background(), 3, 1, 2); err != nil {
		t.Fatal(err)
	}
}
