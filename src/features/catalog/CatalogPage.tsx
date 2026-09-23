import { useWorkspace } from "../../app/WorkspaceProvider";
import { ActionLink, EmptyState } from "../../shared/ui/controls";
import { AnimatedProgress } from "../../shared/motion/AnimatedProgress";

export function CatalogPage() {
  const { state } = useWorkspace();
  const tasks = state.tasks
    .filter((t) => t.publicationStatus === "published")
    .sort(
      (a, b) =>
        b.readinessScore - a.readinessScore ||
        (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""),
    );
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="overline">Каталог задач</p>
          <h1>Помогите бизнесу решить задачу</h1>
          <p className="intro">
            Понятная проблема, ожидаемый результат и данные для начала работы.
          </p>
        </div>
      </div>
      <div className="catalog-toolbar">
        <strong>Задач: {tasks.length}</strong>
        <span>Сначала — с наиболее полной информацией</span>
      </div>
      {tasks.length ? (
        <div className="catalog-grid">
          {tasks.map((task) => {
            const responses = state.proposals.filter(
              (p) => p.taskId === task.id,
            );
            const selected = responses.some((p) => p.status === "accepted");
            return (
              <article className="panel catalog-card" key={task.id}>
                <div className="catalog-card__meta">
                  <span>{task.industry}</span>
                  <span>
                    {selected ? "Команда выбрана" : "Принимает отклики"}
                  </span>
                </div>
                <h2>{task.title}</h2>
                <p className="catalog-problem">{task.context}</p>
                <div className="catalog-result">
                  <span>Что нужно сделать</span>
                  <p>{task.expectedResult}</p>
                </div>
                <AnimatedProgress
                  value={task.readinessScore}
                  label="Готовность задачи"
                  compact
                />
                <div className="catalog-card__footer">
                  <p>
                    {task.availableData
                      ? "Данные описаны"
                      : "Данные не указаны"}{" "}
                    · Отклики: {responses.length}
                  </p>
                  <ActionLink to={`/catalog/${task.id}`}>
                    Открыть задачу <span aria-hidden="true">→</span>
                  </ActionLink>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <EmptyState title="Задач пока нет">
          <p>Опубликованные задачи появятся здесь.</p>
          <ActionLink to="/">К выбору роли</ActionLink>
        </EmptyState>
      )}
    </>
  );
}
