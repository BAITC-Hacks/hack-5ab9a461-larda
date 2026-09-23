import { useWorkspace } from "../../app/WorkspaceProvider";
import { BUSINESS_USER_ID } from "../../domain/models";
import { businessQueue } from "../../domain/businessQueue";
import { ActionLink } from "../../shared/ui/controls";
import { AnimatedProgress } from "../../shared/motion/AnimatedProgress";
export function BusinessDashboard() {
  const { state } = useWorkspace();
  const queue = businessQueue(state, new Date().toISOString().slice(0, 10));
  const projects = state.projects.filter((p) => p.ownerId === BUSINESS_USER_ID);
  const groups = [
    "Ожидают проверки",
    "Просроченные этапы",
    "Отклики команд",
    "Подготовка задач",
    "Активные проекты",
    "Завершённые проекты",
  ];
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="overline">Кабинет бизнеса</p>
          <h1>Ваши решения двигают проекты</h1>
          <p className="intro">
            Понятные условия. Видимый результат. Следующий шаг под вашим
            контролем.
          </p>
        </div>
        <ActionLink
          to="/business/new"
          variant={queue.length ? "secondary" : "primary"}
        >
          + Создать задачу
        </ActionLink>
      </div>
      <div className="metric-strip">
        <div>
          <strong>{queue.filter((i) => i.priority === 0).length}</strong>
          <span>На проверке</span>
        </div>
        <div>
          <strong>{projects.filter((p) => !p.completedAt).length}</strong>
          <span>В работе</span>
        </div>
        <div>
          <strong>{projects.filter((p) => p.completedAt).length}</strong>
          <span>Завершено</span>
        </div>
        <div>
          <strong>
            {projects.reduce(
              (n, p) =>
                n + p.milestones.filter((m) => m.acceptedSubmissionId).length,
              0,
            )}
          </strong>
          <span>Результатов принято</span>
        </div>
      </div>
      {queue[0] && (
        <section className="next-action">
          <div className="next-action__content">
            <p className="overline">Следующее действие</p>
            <h2>{queue[0].title}</h2>
            <p>{queue[0].detail}</p>
            <ActionLink variant="primary" to={queue[0].to}>
              {queue[0].action} →
            </ActionLink>
          </div>
          <div className="next-action__aside">
            <strong>{queue[0].team}</strong>
            {queue[0].date && <span>Срок: {queue[0].date}</span>}
          </div>
        </section>
      )}
      <div className="section-heading">
        <h2>Контроль задач и проектов</h2>
        <ActionLink to="/business/tasks?view=responses">
          Отклики команд
        </ActionLink>
      </div>
      {groups.map((title, priority) => {
        const items = queue.filter((i) => i.priority === priority);
        return (
          items.length > 0 && (
            <section className="queue-group" key={title}>
              <h3>
                {title} <span className="muted">{items.length}</span>
              </h3>
              <div className="task-rows">
                {items.map((i) => (
                  <article className="panel queue-row" key={i.id}>
                    <div>
                      <h3>{i.title}</h3>
                      <p>{i.detail}</p>
                      <p className="muted">
                        {i.team}
                        {i.date
                          ? ` · ${i.priority === 5 ? "Завершён" : "Срок"}: ${i.date}`
                          : ""}
                      </p>
                      {i.progress !== undefined && (
                        <AnimatedProgress
                          value={i.progress}
                          label="Принятые этапы"
                          compact
                        />
                      )}
                    </div>
                    <ActionLink to={i.to}>{i.action}</ActionLink>
                  </article>
                ))}
              </div>
            </section>
          )
        );
      })}
      {!queue.length && (
        <section className="panel">
          <h2>Начните с одной бизнес-задачи</h2>
          <p>Опишите проблему. Помощник покажет, что стоит уточнить.</p>
        </section>
      )}
    </>
  );
}
