package application

import (
	"context"
	"fmt"
	"net/url"
	"sort"
	"strings"

	"larda/internal/domain"
	"larda/internal/ports"
)

type TeamInput struct {
	Name        string   `json:"name"`
	Description string   `json:"description"`
	Interests   []string `json:"interests"`
}
type ProposalInput struct {
	TeamID       int64  `json:"team_id"`
	SolutionIdea string `json:"solution_idea"`
	Plan         string `json:"plan"`
	DurationDays int    `json:"duration_days"`
	PrototypeURL string `json:"prototype_url"`
}
type MilestoneInput struct {
	Position    int    `json:"position"`
	Title       string `json:"title"`
	Description string `json:"description"`
	ExpReward   *int64 `json:"exp_reward"`
}

func workflowInvalid(message string) error  { return fmt.Errorf("%w: %s", domain.ErrInvalid, message) }
func workflowConflict(message string) error { return fmt.Errorf("%w: %s", domain.ErrConflict, message) }
func validURL(value string) bool {
	u, err := url.Parse(value)
	return err == nil && (u.Scheme == "https" || u.Scheme == "http") && u.Host != "" && u.User == nil
}
func captain(r ports.Store, teamID, actorID int64) error {
	if _, err := actor(r, actorID, "student"); err != nil {
		return err
	}
	members, err := r.Members(teamID)
	if err != nil {
		return err
	}
	for _, m := range members {
		if m.UserID == actorID && m.Role == "captain" {
			return nil
		}
	}
	return domain.ErrForbidden
}
func fillTeam(r ports.Store, t *domain.Team) error {
	var err error
	t.Members, err = r.Members(t.ID)
	if err != nil {
		return err
	}
	byID := map[int64]domain.Tag{}
	for _, m := range t.Members {
		tags, err := r.UserTags(m.UserID)
		if err != nil {
			return err
		}
		for _, tag := range tags {
			byID[tag.ID] = tag
		}
	}
	t.Tags = []domain.Tag{}
	for _, tag := range byID {
		t.Tags = append(t.Tags, tag)
	}
	sort.Slice(t.Tags, func(i, j int) bool { return t.Tags[i].ID < t.Tags[j].ID })
	return nil
}
func fillProposal(r ports.Store, p *domain.Proposal) error {
	var err error
	p.Milestones, err = r.Milestones(p.ID)
	return err
}
func (s *Service) Teams(ctx context.Context) (out []domain.Team, err error) {
	err = s.repo.Read(ctx, func(r ports.Store) error {
		out, err = r.Teams()
		if err != nil {
			return err
		}
		for i := range out {
			if err := fillTeam(r, &out[i]); err != nil {
				return err
			}
		}
		return nil
	})
	return
}
func (s *Service) Team(ctx context.Context, id int64) (out *domain.Team, err error) {
	err = s.repo.Read(ctx, func(r ports.Store) error {
		out, err = r.Team(id, false)
		if err != nil {
			return err
		}
		return fillTeam(r, out)
	})
	return
}
func teamInput(in TeamInput) error {
	if strings.TrimSpace(in.Name) == "" || len([]rune(in.Name)) > 120 {
		return workflowInvalid("team name is required and limited to 120 characters")
	}
	return nil
}
func (s *Service) CreateTeam(ctx context.Context, actorID int64, in TeamInput) (out *domain.Team, err error) {
	if err = teamInput(in); err != nil {
		return
	}
	err = s.repo.Transact(ctx, func(r ports.Store) error {
		if _, err := actor(r, actorID, "student"); err != nil {
			return err
		}
		if in.Interests == nil {
			in.Interests = []string{}
		}
		out = &domain.Team{Name: strings.TrimSpace(in.Name), Description: in.Description, Interests: in.Interests}
		out.CreatedAt, out.UpdatedAt = now(), now()
		if err := r.PutTeam(out); err != nil {
			return err
		}
		if err := r.PutMember(&domain.TeamMember{TeamID: out.ID, UserID: actorID, Role: "captain", JoinedAt: now()}); err != nil {
			return err
		}
		return fillTeam(r, out)
	})
	return
}
func (s *Service) UpdateTeam(ctx context.Context, actorID, teamID int64, in TeamInput) (out *domain.Team, err error) {
	if err = teamInput(in); err != nil {
		return
	}
	err = s.repo.Transact(ctx, func(r ports.Store) error {
		out, err = r.Team(teamID, true)
		if err != nil {
			return err
		}
		if err := captain(r, teamID, actorID); err != nil {
			return err
		}
		out.Name, out.Description, out.Interests = strings.TrimSpace(in.Name), in.Description, in.Interests
		if out.Interests == nil {
			out.Interests = []string{}
		}
		out.UpdatedAt = now()
		if err := r.PutTeam(out); err != nil {
			return err
		}
		return fillTeam(r, out)
	})
	return
}
func (s *Service) AddMember(ctx context.Context, actorID, teamID, userID int64) (out *domain.Team, err error) {
	err = s.repo.Transact(ctx, func(r ports.Store) error {
		out, err = r.Team(teamID, true)
		if err != nil {
			return err
		}
		if err := captain(r, teamID, actorID); err != nil {
			return err
		}
		if _, err := actor(r, userID, "student"); err != nil {
			return err
		}
		members, err := r.Members(teamID)
		if err != nil {
			return err
		}
		for _, m := range members {
			if m.UserID == userID {
				return fillTeam(r, out)
			}
		}
		if err := r.PutMember(&domain.TeamMember{TeamID: teamID, UserID: userID, Role: "member", JoinedAt: now()}); err != nil {
			return err
		}
		return fillTeam(r, out)
	})
	return
}
func (s *Service) RemoveMember(ctx context.Context, actorID, teamID, userID int64) (out *domain.Team, err error) {
	err = s.repo.Transact(ctx, func(r ports.Store) error {
		out, err = r.Team(teamID, true)
		if err != nil {
			return err
		}
		if err := captain(r, teamID, actorID); err != nil {
			return err
		}
		if actorID == userID {
			return workflowConflict("transfer captaincy before removing the captain")
		}
		if err := r.DeleteMember(teamID, userID); err != nil {
			return err
		}
		return fillTeam(r, out)
	})
	return
}
func (s *Service) TransferCaptain(ctx context.Context, actorID, teamID, userID int64) (out *domain.Team, err error) {
	err = s.repo.Transact(ctx, func(r ports.Store) error {
		out, err = r.Team(teamID, true)
		if err != nil {
			return err
		}
		if err := captain(r, teamID, actorID); err != nil {
			return err
		}
		members, err := r.Members(teamID)
		if err != nil {
			return err
		}
		var old, next *domain.TeamMember
		for i := range members {
			if members[i].UserID == actorID {
				old = &members[i]
			}
			if members[i].UserID == userID {
				next = &members[i]
			}
		}
		if next == nil {
			return workflowInvalid("new captain must already belong to the team")
		}
		if actorID == userID {
			return fillTeam(r, out)
		}
		old.Role = "member"
		if err := r.PutMember(old); err != nil {
			return err
		}
		next.Role = "captain"
		if err := r.PutMember(next); err != nil {
			return err
		}
		return fillTeam(r, out)
	})
	return
}

func (s *Service) SubmitProposal(ctx context.Context, actorID, taskID int64, in ProposalInput) (out *domain.Proposal, err error) {
	if in.TeamID <= 0 || strings.TrimSpace(in.SolutionIdea) == "" || strings.TrimSpace(in.Plan) == "" || in.DurationDays <= 0 || (in.PrototypeURL != "" && !validURL(in.PrototypeURL)) {
		return nil, workflowInvalid("team, solution idea, plan, positive duration and valid optional prototype URL are required")
	}
	err = s.repo.Transact(ctx, func(r ports.Store) error {
		t, err := r.Task(taskID, true)
		if err != nil {
			return err
		}
		if err := editable(t); err != nil {
			return err
		}
		if t.PublicationStatus != "published" {
			return workflowConflict("only published tasks accept proposals")
		}
		if _, err := r.Team(in.TeamID, true); err != nil {
			return err
		}
		if err := captain(r, in.TeamID, actorID); err != nil {
			return err
		}
		out = &domain.Proposal{TaskID: taskID, TeamID: in.TeamID, SubmittedBy: actorID, SolutionIdea: in.SolutionIdea, Plan: in.Plan, DurationDays: in.DurationDays, PrototypeURL: in.PrototypeURL, Status: "pending", ExecutionStatus: "not_started", Milestones: []domain.Milestone{}}
		out.CreatedAt, out.UpdatedAt = now(), now()
		return r.PutProposal(out)
	})
	return
}
func (s *Service) Proposals(ctx context.Context, actorID, taskID int64) (out []domain.Proposal, err error) {
	err = s.repo.Read(ctx, func(r ports.Store) error {
		t, err := r.Task(taskID, false)
		if err != nil {
			return err
		}
		if t.OwnerID != actorID {
			return domain.ErrForbidden
		}
		out, err = r.Proposals(taskID, 0)
		if err != nil {
			return err
		}
		for i := range out {
			if err := fillProposal(r, &out[i]); err != nil {
				return err
			}
		}
		return nil
	})
	return
}
func (s *Service) TeamProposals(ctx context.Context, actorID, teamID int64) (out []domain.Proposal, err error) {
	err = s.repo.Read(ctx, func(r ports.Store) error {
		if _, err := r.Team(teamID, false); err != nil {
			return err
		}
		members, err := r.Members(teamID)
		if err != nil {
			return err
		}
		allowed := false
		for _, m := range members {
			if m.UserID == actorID {
				allowed = true
			}
		}
		if !allowed {
			return domain.ErrForbidden
		}
		out, err = r.Proposals(0, teamID)
		if err != nil {
			return err
		}
		for i := range out {
			if err := fillProposal(r, &out[i]); err != nil {
				return err
			}
		}
		return nil
	})
	return
}

// Every mutation of a proposal or milestone takes the same task -> team lock
// order. Looking up immutable parent IDs first does not acquire row locks.
func lockProposal(r ports.Store, proposalID int64) (*domain.Task, *domain.Proposal, error) {
	p, err := r.Proposal(proposalID, false)
	if err != nil {
		return nil, nil, err
	}
	t, err := r.Task(p.TaskID, true)
	if err != nil {
		return nil, nil, err
	}
	if _, err := r.Team(p.TeamID, true); err != nil {
		return nil, nil, err
	}
	p, err = r.Proposal(proposalID, true)
	return t, p, err
}
func lockMilestone(r ports.Store, milestoneID int64) (*domain.Task, *domain.Proposal, *domain.Milestone, error) {
	m, err := r.Milestone(milestoneID, false)
	if err != nil {
		return nil, nil, nil, err
	}
	t, p, err := lockProposal(r, m.ProposalID)
	if err != nil {
		return nil, nil, nil, err
	}
	m, err = r.Milestone(milestoneID, true)
	return t, p, m, err
}
func openProposal(t *domain.Task, p *domain.Proposal) error {
	if err := editable(t); err != nil {
		return err
	}
	if p.Status != "accepted" || p.ExecutionStatus == "completed" || p.ExecutionStatus == "cancelled" {
		return workflowConflict("proposal must be accepted and active")
	}
	return nil
}
func (s *Service) DecideProposal(ctx context.Context, actorID, proposalID int64, status string) (out *domain.Proposal, err error) {
	if status != "accepted" && status != "rejected" {
		return nil, workflowInvalid("decision must be accepted or rejected")
	}
	err = s.repo.Transact(ctx, func(r ports.Store) error {
		t, p, err := lockProposal(r, proposalID)
		if err != nil {
			return err
		}
		if t.OwnerID != actorID {
			return domain.ErrForbidden
		}
		out = p
		if p.Status == status {
			return fillProposal(r, out)
		}
		if err := editable(t); err != nil {
			return err
		}
		if p.Status != "pending" {
			return workflowConflict("proposal already has a decision")
		}
		p.Status, p.DecidedBy = status, &actorID
		stamp := now()
		p.DecidedAt, p.UpdatedAt = &stamp, stamp
		if status == "accepted" {
			p.ExecutionStatus = "in_progress"
			t.ExecutionStatus, t.UpdatedAt = "in_progress", stamp
			if err := r.PutTask(t); err != nil {
				return err
			}
		}
		if err := r.PutProposal(p); err != nil {
			return err
		}
		return fillProposal(r, out)
	})
	return
}
func (s *Service) CompleteProposal(ctx context.Context, actorID, proposalID int64) (out *domain.Proposal, err error) {
	err = s.repo.Transact(ctx, func(r ports.Store) error {
		t, p, err := lockProposal(r, proposalID)
		if err != nil {
			return err
		}
		if t.OwnerID != actorID {
			return domain.ErrForbidden
		}
		out = p
		if p.ExecutionStatus == "completed" {
			return fillProposal(r, out)
		}
		if err := openProposal(t, p); err != nil {
			return err
		}
		milestones, err := r.Milestones(p.ID)
		if err != nil {
			return err
		}
		approved := 0
		for _, m := range milestones {
			if m.ApprovedAt == nil {
				continue
			}
			approved++
			if m.Status != "completed" {
				return workflowConflict("all approved milestones must be completed")
			}
		}
		if approved == 0 {
			return workflowConflict("proposal needs at least one completed approved milestone")
		}
		stamp := now()
		p.ExecutionStatus, p.CompletedAt, p.UpdatedAt = "completed", &stamp, stamp
		if err := r.PutProposal(p); err != nil {
			return err
		}
		return fillProposal(r, out)
	})
	return
}
func (s *Service) CancelProposal(ctx context.Context, actorID, proposalID int64) (out *domain.Proposal, err error) {
	err = s.repo.Transact(ctx, func(r ports.Store) error {
		t, p, err := lockProposal(r, proposalID)
		if err != nil {
			return err
		}
		if t.OwnerID != actorID {
			return domain.ErrForbidden
		}
		out = p
		if p.ExecutionStatus == "cancelled" {
			return fillProposal(r, out)
		}
		if err := openProposal(t, p); err != nil {
			return err
		}
		p.ExecutionStatus, p.UpdatedAt = "cancelled", now()
		if err := r.PutProposal(p); err != nil {
			return err
		}
		return fillProposal(r, out)
	})
	return
}

func (s *Service) AddMilestone(ctx context.Context, actorID, proposalID int64, in MilestoneInput) (out *domain.Milestone, err error) {
	if strings.TrimSpace(in.Title) == "" || len([]rune(in.Title)) > 200 || in.Position < 0 || (in.ExpReward != nil && (*in.ExpReward < 0 || *in.ExpReward > 2147483647)) {
		return nil, workflowInvalid("invalid milestone title, position or reward")
	}
	err = s.repo.Transact(ctx, func(r ports.Store) error {
		t, p, err := lockProposal(r, proposalID)
		if err != nil {
			return err
		}
		if err := openProposal(t, p); err != nil {
			return err
		}
		if t.OwnerID != actorID {
			if err := captain(r, p.TeamID, actorID); err != nil {
				return err
			}
		}
		milestones, err := r.Milestones(p.ID)
		if err != nil {
			return err
		}
		position := in.Position
		if position == 0 {
			position = 1
			for _, m := range milestones {
				if m.Position >= position {
					position = m.Position + 1
				}
			}
		}
		for _, m := range milestones {
			if m.Position == position {
				return workflowConflict("milestone position is already used")
			}
		}
		reward := int64(100)
		if in.ExpReward != nil {
			reward = *in.ExpReward
		}
		out = &domain.Milestone{ProposalID: p.ID, Position: position, Title: strings.TrimSpace(in.Title), Description: in.Description, ExpReward: reward, Status: "pending", ProposedBy: actorID}
		stamp := now()
		out.CreatedAt, out.UpdatedAt = stamp, stamp
		if t.OwnerID == actorID {
			out.ApprovedBy, out.ApprovedAt = &actorID, &stamp
		}
		return r.PutMilestone(out)
	})
	return
}
func (s *Service) ApproveMilestone(ctx context.Context, actorID, milestoneID int64) (out *domain.Milestone, err error) {
	err = s.repo.Transact(ctx, func(r ports.Store) error {
		t, p, m, err := lockMilestone(r, milestoneID)
		if err != nil {
			return err
		}
		if t.OwnerID != actorID {
			return domain.ErrForbidden
		}
		out = m
		if m.ApprovedAt != nil {
			return nil
		}
		if err := openProposal(t, p); err != nil {
			return err
		}
		stamp := now()
		m.ApprovedBy, m.ApprovedAt, m.UpdatedAt = &actorID, &stamp, stamp
		return r.PutMilestone(m)
	})
	return
}
func (s *Service) SubmitMilestone(ctx context.Context, actorID, milestoneID int64, resultURL string) (out *domain.Milestone, err error) {
	if !validURL(resultURL) {
		return nil, workflowInvalid("result_url must be an http or https URL")
	}
	err = s.repo.Transact(ctx, func(r ports.Store) error {
		t, p, m, err := lockMilestone(r, milestoneID)
		if err != nil {
			return err
		}
		if err := captain(r, p.TeamID, actorID); err != nil {
			return err
		}
		out = m
		if m.Status == "submitted" && m.ResultURL != nil && *m.ResultURL == resultURL {
			return nil
		}
		if err := openProposal(t, p); err != nil {
			return err
		}
		if m.ApprovedAt == nil {
			return workflowConflict("business must approve the milestone first")
		}
		if m.Status == "completed" {
			return workflowConflict("completed milestone is immutable")
		}
		stamp := now()
		m.Status, m.ResultURL, m.SubmittedAt, m.UpdatedAt = "submitted", &resultURL, &stamp, stamp
		return r.PutMilestone(m)
	})
	return
}

func uniqueSorted(ids []int64) []int64 {
	set := map[int64]bool{}
	for _, id := range ids {
		set[id] = true
	}
	out := make([]int64, 0, len(set))
	for id := range set {
		out = append(out, id)
	}
	sort.Slice(out, func(i, j int) bool { return out[i] < out[j] })
	return out
}
func memberIDs(r ports.Store, teamID int64) ([]int64, error) {
	members, err := r.Members(teamID)
	if err != nil {
		return nil, err
	}
	ids := make([]int64, 0, len(members))
	for _, m := range members {
		ids = append(ids, m.UserID)
	}
	if len(ids) == 0 {
		return nil, workflowConflict("cannot pay an empty team")
	}
	return uniqueSorted(ids), nil
}
func lockUsers(r ports.Store, ids []int64) error {
	for _, id := range uniqueSorted(ids) {
		if _, err := r.User(id, true); err != nil {
			return err
		}
	}
	return nil
}
func (s *Service) ReviewMilestone(ctx context.Context, actorID, milestoneID int64, accepted bool) (out *domain.Milestone, err error) {
	err = s.repo.Transact(ctx, func(r ports.Store) error {
		t, p, m, err := lockMilestone(r, milestoneID)
		if err != nil {
			return err
		}
		if t.OwnerID != actorID {
			return domain.ErrForbidden
		}
		out = m
		if (accepted && m.Status == "completed") || (!accepted && m.Status == "rejected") {
			return nil
		}
		if err := openProposal(t, p); err != nil {
			return err
		}
		if m.Status != "submitted" || m.ApprovedAt == nil {
			return workflowConflict("only a submitted approved milestone can be reviewed")
		}
		stamp := now()
		m.UpdatedAt = stamp
		if !accepted {
			m.Status = "rejected"
			return r.PutMilestone(m)
		}
		ids, err := memberIDs(r, p.TeamID)
		if err != nil {
			return err
		}
		users := append(append([]int64{}, ids...), t.OwnerID)
		if err := lockUsers(r, users); err != nil {
			return err
		}
		shares, err := domain.SplitReward(m.ExpReward, ids)
		if err != nil {
			return err
		}
		m.Status, m.CompletedBy, m.CompletedAt = "completed", &actorID, &stamp
		if err := r.PutMilestone(m); err != nil {
			return err
		}
		for _, id := range ids {
			if _, err := r.AddExp(&domain.ExpTransaction{UserID: id, Amount: shares[id], Reason: "milestone_completed", MilestoneID: &m.ID, CreatedAt: stamp}); err != nil {
				return err
			}
		}
		return awardAchievements(r, uniqueSorted(users))
	})
	return
}

// The caller locks every affected user in ascending ID order before awarding.
// Event counts use payout records, including zero shares, not today's membership.
func awardAchievements(r ports.Store, userIDs []int64) error {
	achievements, err := r.Achievements()
	if err != nil {
		return err
	}
	for _, id := range uniqueSorted(userIDs) {
		u, err := r.User(id, false)
		if err != nil {
			return err
		}
		for _, a := range achievements {
			if !a.IsActive || (a.RoleScope != "all" && a.RoleScope != u.Role) {
				continue
			}
			count, err := r.EventCount(id, u.Role, a.EventType)
			if err != nil {
				return err
			}
			if count < int64(a.TargetCount) {
				continue
			}
			stamp := now()
			inserted, err := r.Unlock(&domain.UserAchievement{UserID: id, AchievementID: a.ID, UnlockedAt: stamp})
			if err != nil {
				return err
			}
			if !inserted {
				continue
			}
			if _, err := r.AddExp(&domain.ExpTransaction{UserID: id, Amount: a.ExpReward, Reason: "achievement_unlocked", AchievementID: &a.ID, CreatedAt: stamp}); err != nil {
				return err
			}
		}
	}
	return nil
}
func (s *Service) CompleteTask(ctx context.Context, actorID, taskID int64) (out *domain.Task, err error) {
	err = s.repo.Transact(ctx, func(r ports.Store) error {
		out, err = owned(r, actorID, taskID)
		if err != nil {
			return err
		}
		if out.ExecutionStatus == "completed" {
			return nil
		}
		if err := editable(out); err != nil {
			return err
		}
		proposals, err := r.Proposals(taskID, 0)
		if err != nil {
			return err
		}
		var teamIDs []int64
		for _, p := range proposals {
			if p.Status != "accepted" {
				continue
			}
			if p.ExecutionStatus != "completed" && p.ExecutionStatus != "cancelled" {
				return workflowConflict("all accepted proposals must be completed or cancelled")
			}
			if p.ExecutionStatus == "completed" {
				teamIDs = append(teamIDs, p.TeamID)
			}
		}
		teamIDs = uniqueSorted(teamIDs)
		if len(teamIDs) == 0 {
			return workflowConflict("at least one accepted proposal must be completed")
		}
		members := map[int64][]int64{}
		users := []int64{out.OwnerID}
		for _, id := range teamIDs {
			if _, err := r.Team(id, true); err != nil {
				return err
			}
			members[id], err = memberIDs(r, id)
			if err != nil {
				return err
			}
			users = append(users, members[id]...)
		}
		users = uniqueSorted(users)
		if err := lockUsers(r, users); err != nil {
			return err
		}
		stamp := now()
		out.ExecutionStatus, out.CompletedAt, out.UpdatedAt = "completed", &stamp, stamp
		if err := r.PutTask(out); err != nil {
			return err
		}
		for _, teamID := range teamIDs {
			shares, err := domain.SplitReward(out.TeamExpReward, members[teamID])
			if err != nil {
				return err
			}
			for _, id := range members[teamID] {
				team := teamID
				if _, err := r.AddExp(&domain.ExpTransaction{UserID: id, Amount: shares[id], Reason: "team_task_completed", TaskID: &out.ID, TeamID: &team, CreatedAt: stamp}); err != nil {
					return err
				}
			}
		}
		if _, err := r.AddExp(&domain.ExpTransaction{UserID: out.OwnerID, Amount: out.BusinessExpReward, Reason: "business_task_completed", TaskID: &out.ID, CreatedAt: stamp}); err != nil {
			return err
		}
		return awardAchievements(r, users)
	})
	return
}
func (s *Service) CancelTask(ctx context.Context, actorID, taskID int64) (out *domain.Task, err error) {
	err = s.repo.Transact(ctx, func(r ports.Store) error {
		out, err = owned(r, actorID, taskID)
		if err != nil {
			return err
		}
		if out.ExecutionStatus == "cancelled" {
			return nil
		}
		if err := editable(out); err != nil {
			return err
		}
		proposals, err := r.Proposals(taskID, 0)
		if err != nil {
			return err
		}
		var teamIDs []int64
		for _, p := range proposals {
			teamIDs = append(teamIDs, p.TeamID)
		}
		for _, id := range uniqueSorted(teamIDs) {
			if _, err := r.Team(id, true); err != nil {
				return err
			}
		}
		stamp := now()
		for i := range proposals {
			p := &proposals[i]
			changed := false
			if p.Status == "pending" {
				p.Status, p.DecidedBy, p.DecidedAt = "rejected", &actorID, &stamp
				changed = true
			}
			if p.Status == "accepted" && p.ExecutionStatus != "completed" && p.ExecutionStatus != "cancelled" {
				p.ExecutionStatus = "cancelled"
				changed = true
			}
			if changed {
				p.UpdatedAt = stamp
				if err := r.PutProposal(p); err != nil {
					return err
				}
			}
		}
		out.ExecutionStatus, out.UpdatedAt = "cancelled", stamp
		return r.PutTask(out)
	})
	return
}
