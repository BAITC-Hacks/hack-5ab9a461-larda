import type {
  ServerAchievement,
  ServerProfile,
  ServerProposal,
  ServerTask,
  ServerUser,
} from "../../data/backendClient";
import { levelAt } from "../../domain/progression";
import { AnimatedProgress } from "../../shared/motion/AnimatedProgress";
import { Button } from "../../shared/ui/controls";

export function ServerOverview({
  user,
  profile,
  tasks,
  proposals,
  achievements,
  onOpen,
}: {
  user: ServerUser;
  profile: ServerProfile | null;
  tasks: ServerTask[];
  proposals: ServerProposal[];
  achievements: ServerAchievement[];
  onOpen: (id: number) => void;
}) {
  const student = user.role === "student";
  const active = proposals.filter(
    (p) => p.status === "accepted" && p.execution_status === "in_progress",
  );
  const reviews = active.filter((p) =>
    p.milestones?.some((m) => m.status === "submitted"),
  );
  const pending = proposals.filter((p) => p.status === "pending");
  const completed = proposals.filter((p) => p.execution_status === "completed");
  const xp = profile?.user.exp ?? user.exp ?? 0;
  const level = levelAt(xp);
  const awards = achievements.filter(
    (a) => a.is_active && ["all", user.role].includes(a.role_scope),
  );
  return (
    <section
      id="overview"
      className="student-section"
      aria-label={student ? "Прогресс студента" : "Контроль работы"}
    >
      {student && (
        <section className="progression-hero">
          <div className="rank-badge" aria-label={`Уровень ${level}`}>
            {level}
          </div>
          <div className="progression-identity">
            <p className="overline">Опыт реальных проектов</p>
            <h2>Уровень {level}</h2>
            <AnimatedProgress
              value={xp - 50 * level * (level - 1)}
              max={100 * level}
              label="К следующему уровню"
            />
            <p>{50 * (level + 1) * level - xp} XP до следующего уровня</p>
          </div>
        </section>
      )}
      <div className="metric-strip">
        <div>
          <strong>{student ? active.length : reviews.length}</strong>
          <span>
            {student ? "Проектов в работе" : "Результатов на проверке"}
          </span>
        </div>
        <div>
          <strong>{pending.length}</strong>
          <span>Заявок на рассмотрении</span>
        </div>
        <div>
          <strong>{completed.length}</strong>
          <span>Работ команд завершено</span>
        </div>
      </div>
      <h2>{student ? "Следующий шаг" : "Требует вашего решения"}</h2>
      {(student ? active : [...reviews, ...pending]).map((p) => {
        const approved = (p.milestones ?? []).filter((m) => m.approved_at);
        const accepted = approved.filter(
          (m) => m.status === "completed",
        ).length;
        return (
          <article className="panel" key={p.id}>
            <p className="overline">
              Команда №{p.team_id} · Заявка №{p.id}
            </p>
            <h3>
              {tasks.find((t) => t.id === p.task_id)?.title ??
                `Задача №${p.task_id}`}
            </h3>
            <p>
              {p.status === "pending"
                ? "Рассмотрите предложение команды"
                : reviews.includes(p)
                  ? student
                    ? "Бизнес проверяет результат"
                    : "Проверьте отправленный результат"
                  : "Продолжите работу над согласованными этапами"}
            </p>
            {approved.length > 0 && (
              <AnimatedProgress
                value={accepted}
                max={approved.length}
                label="Принятые этапы"
                compact
              />
            )}
            <Button onClick={() => onOpen(p.task_id)}>
              Перейти к задаче №{p.task_id}
            </Button>
          </article>
        );
      })}
      {!(student ? active : [...reviews, ...pending]).length && (
        <p className="muted">
          {student
            ? "Выберите задачу в каталоге ниже и предложите решение."
            : "Новых решений пока нет. Создайте задачу или откройте существующую."}
        </p>
      )}
      {student && (
        <>
          <h2>Достижения</h2>
          <div className="achievement-grid">
            {awards.map((a) => {
              const unlocked = profile?.achievements?.some(
                (u) => u.achievement_id === a.id,
              );
              return (
                <article
                  className={`panel achievement-card ${unlocked ? "is-unlocked" : ""}`}
                  key={a.id}
                >
                  <span className="achievement-icon" aria-hidden="true">
                    ◇
                  </span>
                  <h3>{a.title}</h3>
                  <p>{a.description}</p>
                  <p className="xp-reward">+{a.exp_reward} XP</p>
                  <span className="status">
                    {unlocked
                      ? "Открыто · подтверждено сервером"
                      : "Ещё не открыто"}
                  </span>
                </article>
              );
            })}
          </div>
          <h2>Навыки профиля</h2>
          <p>
            {profile?.tags?.map((t) => t.name).join(" · ") ||
              "Навыки пока не указаны"}
          </p>
          <p className="field-help">
            Навыки указаны в профиле; подтверждённые бизнесом результаты
            находятся в проектах.
          </p>
          <h2>Завершённые проекты</h2>
          {completed.map((p) => (
            <article className="verified-result" key={p.id}>
              <p className="overline">✓ Работа команды принята бизнесом</p>
              <h3>
                {tasks.find((t) => t.id === p.task_id)?.title ??
                  `Задача №${p.task_id}`}
              </h3>
              <p>{p.solution_idea}</p>
              {(p.milestones ?? [])
                .filter(
                  (m) =>
                    m.status === "completed" &&
                    /^https?:\/\//i.test(m.result_url ?? ""),
                )
                .map((m) => (
                  <p key={m.id}>
                    <a href={m.result_url!} target="_blank" rel="noreferrer">
                      {m.title} ↗
                    </a>
                  </p>
                ))}
              <Button variant="quiet" onClick={() => onOpen(p.task_id)}>
                Посмотреть подтверждение
              </Button>
            </article>
          ))}
        </>
      )}
    </section>
  );
}
