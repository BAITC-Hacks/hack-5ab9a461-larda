import { useState } from "react";
import { useWorkspace } from "../../app/WorkspaceProvider";
import { STUDENT_USER_ID } from "../../domain/models";
import {
  achievementDefinitions,
  studentProgress,
  projectProgress,
} from "../../domain/progression";
import {
  ActionLink,
  Button,
  ErrorMessage,
  useAction,
} from "../../shared/ui/controls";
import { AnimatedProgress } from "../../shared/motion/AnimatedProgress";
export function StudentPage({ example = false }: { example?: boolean }) {
  const { state: workspace, repository } = useWorkspace();
  const [specimen] = useState(() => repository.getProgressionExample());
  const state = example ? specimen : workspace;
  const action = useAction();
  const p = studentProgress(state, STUDENT_USER_ID);
  const user = state.users.find((u) => u.id === STUDENT_USER_ID);
  const pending = state.xpTransactions.filter(
    (t) =>
      t.userId === STUDENT_USER_ID &&
      !state.acknowledgedTransactionIds.includes(t.id),
  );
  const active = state.projects
    .filter(
      (project) =>
        !project.completedAt &&
        project.members.some((m) => m.userId === STUDENT_USER_ID),
    )
    .sort((a, b) =>
      (
        a.milestones.find((m) => !m.acceptedSubmissionId)?.dueDate ?? ""
      ).localeCompare(
        b.milestones.find((m) => !m.acceptedSubmissionId)?.dueDate ?? "",
      ),
    );
  const selected = state.proposals.filter(
    (proposal) =>
      proposal.status === "accepted" &&
      !state.projects.some((pr) => pr.id === proposal.id) &&
      state.teamMembers.some(
        (m) => m.teamId === proposal.teamId && m.userId === STUDENT_USER_ID,
      ),
  );
  const skills = [...new Set(p.evidence.flatMap((e) => e.contribution.skills))];
  return (
    <>
      {example ? (
        <div className="inline-notice">
          <strong>Синтетический пример · только просмотр</strong>
          <p>
            Этот профиль не изменяет ваши данные. Ссылки на материалы
            демонстрационные.
          </p>
          <ActionLink to="/student">Вернуться к моему прогрессу</ActionLink>
        </div>
      ) : (
        <div className="section-heading">
          <p className="overline">Профессиональный прогресс</p>
          <div className="student-entry-actions">
            <ActionLink to="/student/catalog" variant="primary">
              Открыть каталог задач →
            </ActionLink>
            <ActionLink to="/student/example" variant="quiet">
              Посмотреть пример профиля →
            </ActionLink>
          </div>
        </div>
      )}
      <section className="progression-hero">
        <div className="rank-badge" aria-label={`Ранг ${p.rank.name}`}>
          {p.rank.name}
        </div>
        <div className="progression-identity">
          <p className="overline">Каждый результат делает вас сильнее</p>
          <h1>{user?.name}</h1>
          <p>
            Ранг {p.rank.name} <span className="muted">/</span> Уровень{" "}
            {p.level}
          </p>
          <AnimatedProgress
            value={p.xp}
            max={p.nextRank?.xp ?? Math.max(p.xp, 20000)}
            label="XP к порогу ранга"
          />
          <p className="muted">
            {p.nextRank
              ? `До ранга ${p.nextRank.name}: ${Math.max(0, p.nextRank.xp - p.xp).toLocaleString("ru-RU")} XP · ещё ${Math.max(0, p.nextRank.projects - p.completed.length)} подтверждённых проектов`
              : "Высший ранг достигнут"}
          </p>
          <p className="field-help">
            Следующий уровень: {50 * (p.level + 1) * p.level - p.xp} XP. Ранг
            требует и опыта, и завершённых проектов.
          </p>
        </div>
      </section>
      <div className="metric-strip">
        <div>
          <strong>{p.xp.toLocaleString("ru-RU")}</strong>
          <span>Подтверждённый XP</span>
        </div>
        <div>
          <strong>{p.completed.length}</strong>
          <span>Завершено миссий</span>
        </div>
        <div>
          <strong>{p.completed.length}</strong>
          <span>Проверено бизнесом</span>
        </div>
        <div>
          <strong>{skills.length}</strong>
          <span>Навыков с доказательствами</span>
        </div>
      </div>
      {!example && pending.length > 0 && (
        <section
          className="completion-summary"
          role="status"
          aria-live="polite"
        >
          <p className="overline">Вклад подтверждён</p>
          <h2>
            +{pending.reduce((n, t) => n + t.amount, 0)} XP к вашему опыту
          </h2>
          <p>
            Опыт: {p.xp - pending.reduce((n, t) => n + t.amount, 0)} → {p.xp} XP
          </p>
          {pending.map((t) => (
            <p key={t.id}>
              {state.projects.find((pr) => pr.id === t.projectId)?.brief.title}{" "}
              ·{" "}
              {t.source === "achievement"
                ? `Открыто достижение: ${achievementDefinitions.find((a) => a.id === t.sourceId)?.name}`
                : "Принят результат этапа"}{" "}
              · +{t.amount} XP
            </p>
          ))}
          <Button
            disabled={action.busy}
            onClick={() =>
              action.run(async () => {
                await repository.setRole("student");
                await repository.acknowledgeProgression(
                  pending.map((t) => t.id),
                );
              })
            }
          >
            Продолжить
          </Button>
          <ErrorMessage message={action.error} />
        </section>
      )}
      {!example && (
        <section className="student-section">
          <h2>Мои заявки</h2>
          {state.proposals
            .filter((proposal) =>
              state.teamMembers.some(
                (m) =>
                  m.teamId === proposal.teamId && m.userId === STUDENT_USER_ID,
              ),
            )
            .map((proposal) => (
              <article className="panel" key={proposal.id}>
                <h3>
                  {state.tasks.find((t) => t.id === proposal.taskId)?.title}
                </h3>
                <p>
                  {proposal.status === "pending"
                    ? "На рассмотрении бизнеса"
                    : proposal.status === "accepted"
                      ? "Команда выбрана"
                      : "Заявка отклонена"}{" "}
                  · {proposal.durationDays} дней
                </p>
                <ActionLink to={`/student/catalog/${proposal.taskId}`}>
                  Посмотреть заявку
                </ActionLink>
              </article>
            ))}
          <p className="field-help">
            В начальном демо уже подготовлены три заявки команды «Нова». Для
            новой заявки выберите в каталоге «Только доступные для моей заявки».
          </p>
        </section>
      )}
      <section className="student-section">
        <div className="section-heading">
          <h2>Следующий шаг</h2>
          <ActionLink to="/student/catalog">Выбрать задачу →</ActionLink>
        </div>
        {active.length ? (
          active.map((project, i) => {
            const milestone = project.milestones.find(
              (m) => !m.acceptedSubmissionId,
            )!;
            const latest = state.submissions
              .filter((s) => s.milestoneId === milestone.id)
              .at(-1);
            const review = state.reviews.find(
              (r) => r.submissionId === latest?.id,
            );
            return (
              <article
                className={`panel active-mission ${i === 0 ? "active-mission--featured" : ""}`}
                key={project.id}
              >
                <p className="overline">
                  {latest && !review
                    ? "Ожидаем проверку бизнеса"
                    : review?.decision === "changes_requested"
                      ? "Нужны исправления"
                      : `Следующий результат · ${milestone.title}`}
                </p>
                <h3>{project.brief.title}</h3>
                <p>{milestone.criteria}</p>
                <p className="muted">Срок: {milestone.dueDate}</p>
                <AnimatedProgress
                  value={projectProgress(project)}
                  label="Принятые этапы"
                  compact
                />
                <ActionLink
                  variant="primary"
                  to={`/student/projects/${project.id}`}
                >
                  Открыть миссию
                </ActionLink>
              </article>
            );
          })
        ) : (
          <article className="panel">
            <h3>
              {selected.length
                ? "Ваша команда выбрана"
                : "Ваша следующая миссия впереди"}
            </h3>
            <p>
              {selected.length
                ? "Бизнес подготовит критерии и даты начала."
                : "Выберите реальную задачу и предложите план. XP начисляется только за принятые результаты."}
            </p>
            {selected.map((pr) => (
              <ActionLink key={pr.id} to={`/student/projects/${pr.id}`}>
                {state.tasks.find((t) => t.id === pr.taskId)?.title ??
                  "Открыть миссию"}
              </ActionLink>
            ))}
          </article>
        )}
      </section>
      <section className="student-section">
        <div className="section-heading">
          <h2>Достижения</h2>
          <span className="muted">За реальный профессиональный опыт</span>
        </div>
        <div className="achievement-grid">
          {achievementDefinitions.map((a) => {
            const count =
              a.id === "business_tested" ? p.companies : p.completed.length;
            const unlocked = state.achievements.some(
              (u) => u.userId === STUDENT_USER_ID && u.achievementId === a.id,
            );
            return (
              <article
                className={`panel achievement ${unlocked ? "achievement--unlocked" : ""}`}
                key={a.id}
              >
                <div className="section-heading">
                  <span className="achievement-icon" aria-hidden="true">
                    {a.icon}
                  </span>
                  <span className="status">
                    {unlocked ? "Открыто" : "Не открыто"}
                  </span>
                </div>
                <h3>{a.name}</h3>
                <p>{a.description}</p>
                <AnimatedProgress
                  value={Math.min(count, a.target)}
                  max={a.target}
                  label="Прогресс"
                  compact
                />
                <p className="xp-reward">Награда: +{a.reward} XP</p>
              </article>
            );
          })}
        </div>
      </section>
      <section className="student-section">
        <h2>Навыки, подтверждённые работой</h2>
        {skills.length ? (
          <div className="skill-evidence-grid">
            {skills.map((skill) => (
              <article className="panel" key={skill}>
                <h3>{skill}</h3>
                <p>
                  {
                    p.evidence.filter((e) =>
                      e.contribution.skills.includes(skill),
                    ).length
                  }{" "}
                  подтверждённых вкладов
                </p>
                {p.evidence
                  .filter((e) => e.contribution.skills.includes(skill))
                  .map((e) => (
                    <p key={e.submission.id}>
                      <a
                        href={e.submission.evidenceUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {e.project.brief.title} ↗
                      </a>{" "}
                      · {e.contribution.description}
                    </p>
                  ))}
              </article>
            ))}
          </div>
        ) : (
          <p className="muted">
            После принятия результата здесь появятся навыки и ссылки на вашу
            работу.
          </p>
        )}
      </section>
      <section className="student-section">
        <h2>Подтверждённый бизнес-опыт</h2>
        {p.completed.length ? (
          p.completed.map((project) => (
            <article className="verified-result" key={project.id}>
              <p className="overline">
                ✓ Принято бизнесом ·{" "}
                {state.users.find((u) => u.id === project.ownerId)?.companyName}
              </p>
              <h3>{project.brief.title}</h3>
              <p>{project.brief.context}</p>
              <p className="muted">
                Ваша роль:{" "}
                {project.members.find((m) => m.userId === STUDENT_USER_ID)
                  ?.role === "captain"
                  ? "капитан"
                  : "участник"}{" "}
                · Завершено{" "}
                {new Date(project.completedAt!).toLocaleDateString("ru-RU")}
              </p>
              {p.evidence
                .filter((e) => e.project.id === project.id)
                .map((e) => (
                  <p key={e.submission.id}>
                    <a
                      href={e.submission.evidenceUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {e.contribution.description} ↗
                    </a>{" "}
                    · Подтвердил(а){" "}
                    {
                      state.users.find((u) => u.id === e.review.reviewedBy)
                        ?.name
                    }
                  </p>
                ))}
              {!example && (
                <ActionLink to={`/student/projects/${project.id}`}>
                  Посмотреть подтверждения
                </ActionLink>
              )}
            </article>
          ))
        ) : (
          <p className="muted">
            Завершите проект с подтверждённым вкладом, чтобы добавить его в
            портфолио.
          </p>
        )}
      </section>
    </>
  );
}
