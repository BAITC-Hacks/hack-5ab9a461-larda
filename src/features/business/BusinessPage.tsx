import { useSearchParams } from "react-router-dom";
import { useWorkspace } from "../../app/WorkspaceProvider";
import { BUSINESS_USER_ID } from "../../domain/models";
import { cardOf, nextAction } from "../../domain/taskRules";
import { ActionLink, EmptyState, TaskStatus } from "../../shared/ui/controls";
import { BusinessDashboard } from "./BusinessDashboard";
export function BusinessPage({ listOnly = false }: { listOnly?: boolean }) {
  const { state } = useWorkspace();
  const [params] = useSearchParams();
  if (!listOnly) return <BusinessDashboard />;
  const responsesOnly = params.get("view") === "responses";
  const tasks = state.tasks
    .filter(
      (t) =>
        t.ownerId === BUSINESS_USER_ID &&
        (!responsesOnly || state.proposals.some((p) => p.taskId === t.id)),
    )
    .sort(
      (a, b) =>
        nextAction(a, state.proposals, state.questions).rank -
        nextAction(b, state.proposals, state.questions).rank,
    );
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="overline">Кабинет бизнеса</p>
          <h1>{responsesOnly ? "Отклики команд" : "Мои задачи"}</h1>
          <p className="intro">
            {responsesOnly
              ? "Выберите задачу, чтобы сравнить предложения команд."
              : "Карточки задач и переход к работе с командой."}
          </p>
        </div>
        <ActionLink to="/business/new">+ Создать задачу</ActionLink>
      </div>
      <section className="task-list">
        <div className="section-heading">
          <h2>
            {responsesOnly ? "Задачи с откликами" : "Ваши задачи"}{" "}
            <span className="total-count">{tasks.length}</span>
          </h2>
          <span className="muted">Сначала — требующие действия</span>
        </div>
        {tasks.length ? (
          <div className="task-rows">
            {tasks.map((task) => {
              const proposals = state.proposals.filter(
                (p) => p.taskId === task.id,
              );
              const action = nextAction(task, state.proposals, state.questions);
              return (
                <article className="panel task-row" key={task.id}>
                  <div className="task-row__main">
                    <div className="task-row__title">
                      <h3>{cardOf(task).title || "Новый черновик"}</h3>
                      <TaskStatus
                        task={task}
                        selected={proposals.some(
                          (p) => p.status === "accepted",
                        )}
                      />
                    </div>
                    <p className="muted">
                      Готовность: {task.readinessScore}/100 · Отклики:{" "}
                      {proposals.length}
                    </p>
                  </div>
                  <ActionLink
                    to={
                      responsesOnly
                        ? `/business/tasks/${task.id}/responses`
                        : action.to
                    }
                  >
                    {responsesOnly ? "Посмотреть отклики" : action.label}
                  </ActionLink>
                </article>
              );
            })}
          </div>
        ) : (
          <EmptyState
            title={
              responsesOnly ? "Откликов пока нет" : "Здесь появятся ваши задачи"
            }
          >
            <ActionLink
              to={responsesOnly ? "/business/tasks" : "/business/new"}
            >
              {responsesOnly ? "К моим задачам" : "Создать задачу"}
            </ActionLink>
          </EmptyState>
        )}
      </section>
    </>
  );
}
