package postgres

import (
	"context"
	"fmt"
	"gorm.io/gorm"
	"hackalem/internal/domain"
	"time"
)

// SeedDemo fills an empty application database once. It never calls a paid API.
// The same two students participate in all five teams, keeping exactly three demo identities.
func (r *Repository) SeedDemo(ctx context.Context) error {
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Exec("SELECT pg_advisory_xact_lock(727341103)").Error; err != nil {
			return err
		}
		var count int64
		if err := tx.Model(&domain.User{}).Count(&count).Error; err != nil {
			return err
		}
		if count > 0 {
			return nil
		}
		company := "Demo Business"
		users := []domain.User{{Name: "Бизнес", Role: "business", CompanyName: &company}, {Name: "Капитан", Role: "student"}, {Name: "Студент", Role: "student"}}
		for i := range users {
			if err := tx.Create(&users[i]).Error; err != nil {
				return err
			}
		}
		s := &store{db: tx}
		if err := s.SetUserTags(users[1].ID, []int64{1, 4}); err != nil {
			return err
		}
		if err := s.SetUserTags(users[2].ID, []int64{2, 6}); err != nil {
			return err
		}
		titles := []string{"Учёт остатков кафе", "Аналитика обращений", "Каталог локальных мастеров", "Запись на консультации", "Планирование доставки"}
		topics := []string{"retail", "analytics", "marketplace", "education", "logistics"}
		raw := []string{"Кафе теряет продукты из-за неточного учёта остатков.", "Служба поддержки хочет понять частые причины обращений клиентов.", "Мастерским нужен единый каталог услуг с поиском.", "Учебному центру нужна запись студентов на консультации.", "Небольшой магазин хочет планировать ежедневные доставки."}
		weights := []int{20, 20, 15, 15, 10, 10, 10}
		keys := []string{"context_need", "data", "result", "success_criteria", "constraints", "users", "communication"}
		filled := []int{1, 2, 4, 6, 7}
		for i := 0; i < 5; i++ {
			team := domain.Team{Name: fmt.Sprintf("Команда %d", i+1), Description: "Демонстрационная студенческая команда", Interests: []string{topics[i]}}
			if err := s.PutTeam(&team); err != nil {
				return err
			}
			for j := 1; j < 3; j++ {
				role := "member"
				if j == 1 {
					role = "captain"
				}
				if err := s.PutMember(&domain.TeamMember{TeamID: team.ID, UserID: users[j].ID, Role: role, JoinedAt: time.Now().UTC()}); err != nil {
					return err
				}
			}
			card := domain.Card{Industry: "small_business", Topic: topics[i], Title: titles[i], Context: raw[i], Need: "Упростить текущий процесс", TagIDs: []int64{4, 6}}
			if filled[i] >= 2 {
				card.AvailableData = "Обезличенная CSV-выгрузка за три месяца"
			}
			if filled[i] >= 4 {
				card.ExpectedResult = "Работающий веб-прототип с инструкцией"
				card.SuccessCriteria = "Не менее 9 из 10 тестовых сценариев выполняются без ошибок"
			}
			if filled[i] >= 6 {
				card.Constraints = "Две недели, веб-приложение, только обезличенные данные"
				card.TargetUsers = "Сотрудники компании"
			}
			if filled[i] >= 7 {
				card.Contact = "demo@example.test"
				card.InteractionFormat = "Консультация каждую среду"
				card.FeedbackProcess = "Ответ по результатам этапа в течение двух рабочих дней"
			}
			eval := domain.Evaluation{Source: "demo_seed", Criteria: []domain.Criterion{}, Missing: []string{}}
			for n, key := range keys {
				c := domain.Criterion{Key: key, Reason: "Демонстрационная оценка подтверждённых данных", Missing: []string{}}
				if n < filled[i] {
					c.Score = weights[n]
					eval.Score += c.Score
				} else {
					c.Missing = []string{key}
					eval.Missing = append(eval.Missing, key)
				}
				eval.Criteria = append(eval.Criteria, c)
			}
			stamp := time.Now().UTC()
			rev := int64(1)
			task := domain.Task{OwnerID: users[0].ID, Card: card, RawDescription: raw[i], Revision: rev, EvaluatedRevision: &rev, AIStatus: "succeeded", PublicationStatus: "published", ReadinessScore: eval.Score, ScoreBreakdown: eval, ConfirmedAt: &stamp, PublishedAt: &stamp, ExecutionStatus: "not_started", TeamExpReward: 100, BusinessExpReward: 50}
			if err := s.PutTask(&task); err != nil {
				return err
			}
			if err := s.SetTaskTags(task.ID, card.TagIDs); err != nil {
				return err
			}
			p := domain.Proposal{TaskID: task.ID, TeamID: team.ID, SubmittedBy: users[1].ID, SolutionIdea: "Создать веб-прототип по требованиям карточки", Plan: "Анализ, прототип, тестирование и демонстрация", DurationDays: 14, PrototypeURL: "https://example.test/prototype", Status: "pending", ExecutionStatus: "not_started"}
			if err := s.PutProposal(&p); err != nil {
				return err
			}
		}
		for i := 0; i < 5; i++ {
			card := domain.Card{Context: raw[i], Industry: "small_business", Topic: topics[i], TagIDs: []int64{}}
			draft := domain.Task{OwnerID: users[0].ID, RawDescription: raw[i], DraftCard: &card, Revision: 1, AIStatus: "pending", PublicationStatus: "draft", ExecutionStatus: "not_started", TeamExpReward: 100, BusinessExpReward: 50}
			if err := s.PutTask(&draft); err != nil {
				return err
			}
			job := domain.AIJob{TaskID: draft.ID, Revision: 1, Kind: "questions", Status: "pending", Input: domain.AIInput{RawDescription: raw[i], Card: card}}
			// Samples are for inspection; no startup API work or credit spend is triggered.
			job.Status = "failed"
			job.Error = "Demo draft: request an explicit AI retry to generate questions."
			draft.AIStatus = "failed"
			draft.AIError = job.Error
			if err := s.PutJob(&job); err != nil {
				return err
			}
			if err := s.PutTask(&draft); err != nil {
				return err
			}
		}
		// Keep the demo balance and ledger consistent with its already-published cards.
		var a domain.Achievement
		if err := tx.Where("code = ?", "first_task_published").First(&a).Error; err != nil {
			return err
		}
		if _, err := s.Unlock(&domain.UserAchievement{UserID: users[0].ID, AchievementID: a.ID, UnlockedAt: time.Now().UTC()}); err != nil {
			return err
		}
		_, err := s.AddExp(&domain.ExpTransaction{UserID: users[0].ID, Amount: a.ExpReward, Reason: "achievement_unlocked", AchievementID: &a.ID, CreatedAt: time.Now().UTC()})
		return err
	})
}
