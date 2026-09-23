import { useWorkspace } from "../../app/WorkspaceProvider";
import { BUSINESS_USER_ID, type Task } from "../../domain/models";
import { cardOf, nextAction } from "../../domain/taskRules";
import { ActionLink, EmptyState, TaskStatus } from "../../shared/ui/controls";
import { ResponseCount } from "../../shared/motion/ResponseCount";
import { useSearchParams } from "react-router-dom";

export function NextActionCard({ task }: { task?: Task }) {
  const { state } = useWorkspace();
  const action = task
    ? nextAction(task, state.proposals, state.questions)
    : {
        label: "Создать задачу",
        to: "/business/new",
        note: "Опишите проблему своими словами. Помощник задаст вопросы и соберёт понятную карточку.",
      };
  return (
    <section className="next-action">
      <div className="next-action__content">
        <p className="overline">Следующее действие</p>
        <h2>
          {task
            ? cardOf(task).title || "Продолжите вашу задачу"
            : "Расскажите, с чем нужна помощь"}
        </h2>
        <p>{action.note}</p>
        <ActionLink to={action.to} variant="primary">
          {action.label} <span aria-hidden="true">→</span>
        </ActionLink>
      </div>
      <div className="next-action__aside" aria-hidden="true">
        <span className="action-symbol">
          {task?.publicationStatus === "published" ? "☷" : "+"}
        </span>
        <span>
          Одна задача.
          <br />
          Понятный следующий шаг.
        </span>
      </div>
    </section>
  );
}
export function BusinessPage({ listOnly = false }: { listOnly?: boolean }) {
  const { state } = useWorkspace();
  const [params] = useSearchParams();
  const responsesOnly = listOnly && params.get("view") === "responses";
  const tasks = state.tasks
    .filter((t) => t.ownerId === BUSINESS_USER_ID)
    .sort(
      (a, b) =>
        nextAction(a, state.proposals, state.questions).rank -
        nextAction(b, state.proposals, state.questions).rank,
    );
  const ownResponses = state.proposals.filter((p) =>
    tasks.some((t) => t.id === p.taskId),
  );
  const visibleTasks = responsesOnly
    ? tasks.filter((task) => ownResponses.some((p) => p.taskId === task.id))
    : tasks;
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="overline">Кабинет бизнеса</p>
          <h1>
            {responsesOnly
              ? "Отклики команд"
              : listOnly
                ? "Мои задачи"
                : "Что вы хотите сделать?"}
          </h1>
          <p className="intro">
            {responsesOnly
              ? "Выберите задачу, чтобы сравнить предложения команд."
              : listOnly
                ? "Черновики, опубликованные задачи и решения по командам."
                : "Создавайте задачи и рассматривайте отклики в одном месте."}
          </p>
        </div>
      </div>
      {!listOnly && (
        <>
          <div className="quick-actions">
            <ActionLink to="/business/new">+ Создать задачу</ActionLink>
            <ActionLink to="/business/tasks?view=responses">
              <ResponseCount
                count={
                  ownResponses.filter((p) => p.status === "pending").length
                }
                highlight={ownResponses.some(
                  (p) => !state.seenProposalIds.includes(p.id),
                )}
              />
            </ActionLink>
          </div>
          <NextActionCard task={tasks[0]} />
        </>
      )}
      <section className="task-list" aria-labelledby="my-tasks">
        <div className="section-heading">
          <h2 id="my-tasks">
            {responsesOnly
              ? "Задачи с откликами"
              : listOnly
                ? "Ваши задачи"
                : "Мои задачи"}{" "}
            <span className="total-count">{visibleTasks.length}</span>
          </h2>
          <span className="muted">Сначала — требующие действия</span>
        </div>
        {visibleTasks.length === 0 ? (
          <EmptyState
            title={
              responsesOnly ? "Откликов пока нет" : "Здесь появятся ваши задачи"
            }
          >
            <p>
              {responsesOnly
                ? "Здесь появятся задачи, на которые ответили команды."
                : "Начните с описания первой проблемы."}
            </p>
            <ActionLink
              to={responsesOnly ? "/business/tasks" : "/business/new"}
              variant={listOnly ? "primary" : "secondary"}
            >
              {responsesOnly ? "К моим задачам" : "Создать задачу"}
            </ActionLink>
          </EmptyState>
        ) : (
          <div className="task-rows">
            {visibleTasks.map((task) => {
              const action = nextAction(task, state.proposals, state.questions);
              const responses = state.proposals.filter(
                (p) => p.taskId === task.id,
              );
              return (
                <article className="task-row" key={task.id}>
                  <div className="task-row__icon" aria-hidden="true">
                    ▤
                  </div>
                  <div className="task-row__body">
                    <TaskStatus
                      task={task}
                      selected={responses.some((p) => p.status === "accepted")}
                    />
                    <h3>{cardOf(task).title || "Новая задача"}</h3>
                    <p>
                      {task.readinessScore} из 100 ·{" "}
                      {responses.length
                        ? `Отклики: ${responses.length}`
                        : "Откликов пока нет"}
                    </p>
                  </div>
                  <ActionLink
                    to={
                      responsesOnly
                        ? `/business/tasks/${task.id}/responses`
                        : action.to
                    }
                  >
                    {responsesOnly
                      ? `Посмотреть отклики · ${responses.length}`
                      : action.label}{" "}
                    <span aria-hidden="true">→</span>
                  </ActionLink>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </>
  );
}
