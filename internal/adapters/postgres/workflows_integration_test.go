package postgres

import (
	"context"
	"fmt"
	"sync"
	"testing"
	"time"

	"larda/internal/adapters/ai"
	"larda/internal/application"
	"larda/internal/domain"
	"larda/internal/ports"
)

func integrationTeam(t *testing.T, s *application.Service, name string, members ...int64) *domain.Team {
	t.Helper()
	team, err := s.CreateTeam(context.Background(), 2, application.TeamInput{Name: name})
	if err != nil {
		t.Fatal(err)
	}
	for _, id := range members {
		if _, err := s.AddMember(context.Background(), 2, team.ID, id); err != nil {
			t.Fatal(err)
		}
	}
	return team
}

func integrationSubmittedMilestone(t *testing.T, s *application.Service, taskID, teamID, reward int64) (*domain.Proposal, *domain.Milestone) {
	t.Helper()
	ctx := context.Background()
	p, err := s.SubmitProposal(ctx, 2, taskID, application.ProposalInput{TeamID: teamID, SolutionIdea: "Integration prototype", Plan: "Deliver a tested prototype", DurationDays: 5})
	if err != nil {
		t.Fatal(err)
	}
	if _, err = s.DecideProposal(ctx, 1, p.ID, "accepted"); err != nil {
		t.Fatal(err)
	}
	m, err := s.AddMilestone(ctx, 2, p.ID, application.MilestoneInput{Title: "Prototype", ExpReward: &reward})
	if err != nil {
		t.Fatal(err)
	}
	if _, err = s.ApproveMilestone(ctx, 1, m.ID); err != nil {
		t.Fatal(err)
	}
	if _, err = s.SubmitMilestone(ctx, 2, m.ID, "https://example.com/prototype"); err != nil {
		t.Fatal(err)
	}
	return p, m
}

func assertBalancesMatchLedger(t *testing.T, r *Repository) {
	t.Helper()
	var mismatches int64
	err := r.db.Raw("SELECT count(*) FROM users u WHERE u.exp <> (SELECT COALESCE(sum(e.amount), 0) FROM exp_transactions e WHERE e.user_id = u.id)").Scan(&mismatches).Error
	if err != nil {
		t.Fatal(err)
	}
	if mismatches != 0 {
		t.Fatalf("%d user balances differ from ledger", mismatches)
	}
}

func TestIntegrationConcurrentMilestoneReviewAndMembershipRetry(t *testing.T) {
	r := testRepo(t)
	s := application.New(r, ai.NewFallback())
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	team := integrationTeam(t, s, "Concurrent payout", 3)
	_, m := integrationSubmittedMilestone(t, s, 1, team.ID, 1)
	newMember := domain.User{Name: "Additional student", Role: "student"}
	if err := r.db.Create(&newMember).Error; err != nil {
		t.Fatal(err)
	}
	if _, err := s.AddMember(ctx, 2, team.ID, newMember.ID); err != nil {
		t.Fatal(err)
	}
	const workers = 8
	start := make(chan struct{})
	results := make(chan error, workers)
	var wg sync.WaitGroup
	for i := 0; i < workers; i++ {
		wg.Add(1)
		go func() { defer wg.Done(); <-start; _, err := s.ReviewMilestone(ctx, 1, m.ID, true); results <- err }()
	}
	close(start)
	wg.Wait()
	close(results)
	for err := range results {
		if err != nil {
			t.Fatalf("concurrent review: %v", err)
		}
	}
	var ledger []domain.ExpTransaction
	if err := r.db.Where("milestone_id = ? AND reason = ?", m.ID, "milestone_completed").Order("user_id").Find(&ledger).Error; err != nil {
		t.Fatal(err)
	}
	if len(ledger) != 3 {
		t.Fatalf("payout rows=%d want 3", len(ledger))
	}
	for i, entry := range ledger {
		want := int64(0)
		if i == 0 {
			want = 1
		}
		if entry.Amount != want {
			t.Errorf("user %d amount=%d want %d", entry.UserID, entry.Amount, want)
		}
	}
	var achievement domain.Achievement
	if err := r.db.Where("code = ?", "first_milestone_completed").First(&achievement).Error; err != nil {
		t.Fatal(err)
	}
	var unlockCount, bonusCount int64
	ids := []int64{2, 3, newMember.ID}
	if err := r.db.Model(&domain.UserAchievement{}).Where("achievement_id = ? AND user_id IN ?", achievement.ID, ids).Count(&unlockCount).Error; err != nil {
		t.Fatal(err)
	}
	if err := r.db.Model(&domain.ExpTransaction{}).Where("achievement_id = ? AND user_id IN ?", achievement.ID, ids).Count(&bonusCount).Error; err != nil {
		t.Fatal(err)
	}
	if unlockCount != 3 || bonusCount != 3 {
		t.Fatalf("zero shares must count for one-time achievements: unlocks=%d bonuses=%d", unlockCount, bonusCount)
	}
	later := domain.User{Name: "Late student", Role: "student"}
	if err := r.db.Create(&later).Error; err != nil {
		t.Fatal(err)
	}
	if _, err := s.RemoveMember(ctx, 2, team.ID, 3); err != nil {
		t.Fatal(err)
	}
	if _, err := s.AddMember(ctx, 2, team.ID, later.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := s.ReviewMilestone(ctx, 1, m.ID, true); err != nil {
		t.Fatal(err)
	}
	var count int64
	if err := r.db.Model(&domain.ExpTransaction{}).Where("milestone_id = ?", m.ID).Count(&count).Error; err != nil {
		t.Fatal(err)
	}
	if count != 3 {
		t.Fatal("retry redistributed the milestone reward")
	}
	if err := r.db.Model(&domain.ExpTransaction{}).Where("user_id = ?", later.ID).Count(&count).Error; err != nil {
		t.Fatal(err)
	}
	if count != 0 {
		t.Fatal("late member received a historical reward")
	}
	assertBalancesMatchLedger(t, r)
}

func TestIntegrationTaskPaysDistinctCurrentTeamsOnce(t *testing.T) {
	r := testRepo(t)
	s := application.New(r, ai.NewFallback())
	ctx := context.Background()
	newMember := domain.User{Name: "Current participant", Role: "student"}
	if err := r.db.Create(&newMember).Error; err != nil {
		t.Fatal(err)
	}
	team1 := integrationTeam(t, s, "First completion team", 3, newMember.ID)
	team2 := integrationTeam(t, s, "Second completion team", 3)
	for _, teamID := range []int64{team1.ID, team1.ID, team2.ID} {
		p, m := integrationSubmittedMilestone(t, s, 2, teamID, 0)
		if _, err := s.ReviewMilestone(ctx, 1, m.ID, true); err != nil {
			t.Fatal(err)
		}
		if _, err := s.CompleteProposal(ctx, 1, p.ID); err != nil {
			t.Fatal(err)
		}
	}
	// Membership at task completion, rather than milestone or proposal time,
	// controls the task reward. Student 3 retains their existing milestone EXP.
	if _, err := s.RemoveMember(ctx, 2, team1.ID, 3); err != nil {
		t.Fatal(err)
	}
	if _, err := s.CompleteTask(ctx, 1, 2); err != nil {
		t.Fatal(err)
	}
	var ledger []domain.ExpTransaction
	if err := r.db.Where("task_id = ? AND reason = ?", 2, "team_task_completed").Order("team_id, user_id").Find(&ledger).Error; err != nil {
		t.Fatal(err)
	}
	if len(ledger) != 4 {
		t.Fatalf("task shares=%d want 4 (two distinct teams)", len(ledger))
	}
	expected := map[string]int64{fmt.Sprintf("%d/2", team1.ID): 50, fmt.Sprintf("%d/%d", team1.ID, newMember.ID): 50, fmt.Sprintf("%d/2", team2.ID): 50, fmt.Sprintf("%d/3", team2.ID): 50}
	for _, entry := range ledger {
		if entry.TeamID == nil {
			t.Fatal("team task ledger row has no team")
		}
		key := fmt.Sprintf("%d/%d", *entry.TeamID, entry.UserID)
		want, ok := expected[key]
		if !ok || entry.Amount != want {
			t.Errorf("share %s=%d want %d (expected=%v)", key, entry.Amount, want, ok)
		}
		delete(expected, key)
	}
	if len(expected) != 0 {
		t.Fatalf("missing shares %v", expected)
	}
	var businessRows int64
	if err := r.db.Model(&domain.ExpTransaction{}).Where("task_id = ? AND reason = ?", 2, "business_task_completed").Count(&businessRows).Error; err != nil {
		t.Fatal(err)
	}
	if businessRows != 1 {
		t.Fatalf("business rewards=%d want1", businessRows)
	}
	// An overlapping member has completed one distinct task, not two or three.
	var eventCount int64
	if err := r.Read(ctx, func(store ports.Store) error {
		var err error
		eventCount, err = store.EventCount(2, "student", "task_completed")
		return err
	}); err != nil {
		t.Fatal(err)
	}
	if eventCount != 1 {
		t.Fatalf("distinct completed tasks=%d want1", eventCount)
	}
	if _, err := s.AddMember(ctx, 2, team1.ID, 3); err != nil {
		t.Fatal(err)
	}
	if _, err := s.CompleteTask(ctx, 1, 2); err != nil {
		t.Fatal(err)
	}
	var count int64
	if err := r.db.Model(&domain.ExpTransaction{}).Where("task_id = ? AND reason = ?", 2, "team_task_completed").Count(&count).Error; err != nil {
		t.Fatal(err)
	}
	if count != 4 {
		t.Fatal("completion retry redistributed current-team payouts")
	}
	assertBalancesMatchLedger(t, r)
}
