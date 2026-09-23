package postgres

import (
	"larda/internal/domain"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

func (s *store) Team(id int64, lock bool) (*domain.Team, error) {
	var v domain.Team
	err := locked(s.db, lock).First(&v, id).Error
	return &v, normalize(err)
}
func (s *store) Teams() ([]domain.Team, error) {
	v := []domain.Team{}
	err := s.db.Order("id").Find(&v).Error
	return v, normalize(err)
}
func (s *store) PutTeam(v *domain.Team) error { return put(s.db, v) }
func (s *store) Members(teamID int64) ([]domain.TeamMember, error) {
	v := []domain.TeamMember{}
	err := s.db.Where("team_id = ?", teamID).Order("user_id").Find(&v).Error
	return v, normalize(err)
}
func (s *store) PutMember(v *domain.TeamMember) error {
	return normalize(s.db.Clauses(clause.OnConflict{Columns: []clause.Column{{Name: "team_id"}, {Name: "user_id"}}, DoUpdates: clause.AssignmentColumns([]string{"role"})}).Create(v).Error)
}
func (s *store) DeleteMember(teamID, userID int64) error {
	return normalize(s.db.Where("team_id = ? AND user_id = ?", teamID, userID).Delete(&domain.TeamMember{}).Error)
}
func (s *store) Proposal(id int64, lock bool) (*domain.Proposal, error) {
	var v domain.Proposal
	err := locked(s.db, lock).First(&v, id).Error
	return &v, normalize(err)
}
func (s *store) Proposals(taskID, teamID int64) ([]domain.Proposal, error) {
	v := []domain.Proposal{}
	q := s.db.Order("id")
	if taskID != 0 {
		q = q.Where("task_id = ?", taskID)
	}
	if teamID != 0 {
		q = q.Where("team_id = ?", teamID)
	}
	err := q.Find(&v).Error
	return v, normalize(err)
}
func (s *store) PutProposal(v *domain.Proposal) error { return put(s.db, v) }
func (s *store) Milestone(id int64, lock bool) (*domain.Milestone, error) {
	var v domain.Milestone
	err := locked(s.db, lock).First(&v, id).Error
	return &v, normalize(err)
}
func (s *store) Milestones(proposalID int64) ([]domain.Milestone, error) {
	v := []domain.Milestone{}
	err := s.db.Where("proposal_id = ?", proposalID).Order("position, id").Find(&v).Error
	return v, normalize(err)
}
func (s *store) PutMilestone(v *domain.Milestone) error { return put(s.db, v) }
func (s *store) Achievements() ([]domain.Achievement, error) {
	v := []domain.Achievement{}
	err := s.db.Where("is_active = true").Order("id").Find(&v).Error
	return v, normalize(err)
}
func (s *store) UserAchievements(userID int64) ([]domain.UserAchievement, error) {
	v := []domain.UserAchievement{}
	err := s.db.Where("user_id = ?", userID).Order("achievement_id").Find(&v).Error
	return v, normalize(err)
}
func (s *store) Unlock(v *domain.UserAchievement) (bool, error) {
	res := s.db.Clauses(clause.OnConflict{DoNothing: true}).Create(v)
	return res.RowsAffected == 1, normalize(res.Error)
}

// AddExp and the balance update use the caller's transaction. The ledger's
// partial unique indexes make retries safe, including zero-valued shares.
func (s *store) AddExp(v *domain.ExpTransaction) (bool, error) {
	res := s.db.Clauses(clause.OnConflict{DoNothing: true}).Create(v)
	if res.Error != nil {
		return false, normalize(res.Error)
	}
	if res.RowsAffected == 0 {
		return false, nil
	}
	res = s.db.Model(&domain.User{}).Where("id = ?", v.UserID).Updates(map[string]any{"exp": gorm.Expr("exp + ?", v.Amount), "updated_at": v.CreatedAt})
	return true, normalize(res.Error)
}
func (s *store) ExpHistory(userID int64) ([]domain.ExpTransaction, error) {
	v := []domain.ExpTransaction{}
	err := s.db.Where("user_id = ?", userID).Order("created_at DESC, id DESC").Find(&v).Error
	return v, normalize(err)
}
func (s *store) EventCount(userID int64, role, event string) (int64, error) {
	var n int64
	var q *gorm.DB
	if role == "student" {
		q = s.db.Model(&domain.ExpTransaction{}).Where("user_id = ?", userID)
		switch event {
		case "milestone_completed":
			q = q.Where("reason = ?", "milestone_completed").Distinct("milestone_id")
		case "task_completed":
			q = q.Where("reason = ?", "team_task_completed").Distinct("task_id")
		default:
			return 0, nil
		}
	} else {
		switch event {
		case "task_published":
			q = s.db.Model(&domain.Task{}).Where("owner_id = ? AND published_at IS NOT NULL", userID)
		case "task_completed":
			q = s.db.Model(&domain.Task{}).Where("owner_id = ? AND execution_status = ?", userID, "completed")
		case "milestone_completed":
			q = s.db.Table("milestones m").Joins("JOIN proposals p ON p.id = m.proposal_id").Joins("JOIN tasks t ON t.id = p.task_id").Where("t.owner_id = ? AND m.status = ?", userID, "completed").Distinct("m.id")
		default:
			return 0, nil
		}
	}
	err := q.Count(&n).Error
	return n, normalize(err)
}
