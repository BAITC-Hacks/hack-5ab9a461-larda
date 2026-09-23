import { useState } from "react";
import { useParams } from "react-router-dom";
import { useWorkspace } from "../../app/WorkspaceProvider";
import { BUSINESS_USER_ID, type TaskCard } from "../../domain/models";
import {
  cardOf,
  taskReady,
  improvements,
  readinessBand,
} from "../../domain/taskRules";
import {
  ActionLink,
  Button,
  EmptyState,
  ErrorMessage,
  PageTrail,
  TaskStatus,
  useAction,
} from "../../shared/ui/controls";
import { TaskBrief, cardFields } from "../../shared/ui/TaskBrief";
import { AnimatedProgress } from "../../shared/motion/AnimatedProgress";
import { SaveConfirmation } from "../../shared/motion/SaveConfirmation";
export function TaskReview() {
  const { id } = useParams();
  const { state, repository } = useWorkspace();
  const action = useAction();
  const [editing, setEditing] = useState(false);
  const [focusField, setFocusField] = useState<keyof TaskCard>("title");
  const [confirmed, setConfirmed] = useState(false);
  const task = state.tasks.find(
    (t) => t.id === id && t.ownerId === BUSINESS_USER_ID,
  );
  if (!task)
    return (
      <EmptyState title="Задача не найдена">
        <ActionLink to="/business/tasks">К моим задачам</ActionLink>
      </EmptyState>
    );
  const card = cardOf(task);
  const draft = task.publicationStatus === "draft";
  const editable = task.executionStatus === "not_started";
  const selected = state.proposals.find(
    (p) => p.taskId === id && p.status === "accepted",
  );
  return (
    <>
      <PageTrail title={card.title || "Проверка задачи"} />
      <div className="page-heading">
        <div>
          <p className="overline">
            {draft ? "Проверка и подтверждение" : "Моя задача"}
          </p>
          <h1>{card.title || "Проверьте задачу"}</h1>
          <p className="intro">
            Полнота постановки помогает команде начать работу. Решения остаются
            за вами.
          </p>
        </div>
        <TaskStatus task={task} selected={!!selected} />
      </div>
      <div className="workspace-grid">
        <section className="panel">
          {editing ? (
            <CardEditor
              key={focusField}
              card={card}
              skills={task.skills}
              focusField={focusField}
              busy={action.busy}
              onCancel={() => setEditing(false)}
              onSave={(value, skills) =>
                action.run(async () => {
                  const before = task.readinessScore;
                  await repository.updateCard(task.id, value, skills);
                  const after = repository
                    .getSnapshot()
                    .tasks.find((t) => t.id === task.id)!.readinessScore;
                  setEditing(false);
                  setConfirmed(false);
                  action.confirm(
                    `Подтверждено: ${before} → ${after} (${after - before >= 0 ? "+" : ""}${after - before}). ${readinessBand(after)}`,
                  );
                })
              }
            />
          ) : (
            <>
              <div className="section-heading">
                <h2>Карточка задачи</h2>
                {editable && (
                  <Button
                    variant="quiet"
                    onClick={() => {
                      setFocusField("title");
                      setEditing(true);
                    }}
                  >
                    Изменить
                  </Button>
                )}
              </div>
              <TaskBrief card={card} />
              <p className="muted">
                Навыки: {task.skills.join(" · ") || "Пока не указаны"}
              </p>
              {!editable && (
                <p className="inline-notice">
                  Условия зафиксированы при начале проекта.
                </p>
              )}
            </>
          )}
          <ErrorMessage message={action.error} />
          <SaveConfirmation message={action.message} />
        </section>
        <aside className="panel task-preview">
          <span className="status">{readinessBand(task.readinessScore)}</span>
          <AnimatedProgress
            value={task.readinessScore}
            label="Готовность задачи"
          />
          <p className="field-help">
            Оценка заполненности, не качества текста. Подтверждённую задачу
            можно опубликовать при любой готовности.
          </p>
          <div className="score-breakdown">
            {task.scoreBreakdown.map((i) => (
              <div key={i.field}>
                <span>{i.label}</span>
                <strong>
                  {i.earned} / {i.max}
                </strong>
              </div>
            ))}
          </div>
          {editable && !editing && (
            <div className="improvement">
              <h3>Следующее улучшение</h3>
              {improvements(card).map((i) => (
                <Button
                  key={i.field}
                  variant="quiet"
                  onClick={() => {
                    setFocusField(i.field);
                    setEditing(true);
                  }}
                >
                  +{i.max} · {i.label} →
                </Button>
              ))}
              {!improvements(card).length && <p>Все сведения заполнены.</p>}
            </div>
          )}
          {draft && !editing && (
            <>
              <label className="check-row">
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(e) => setConfirmed(e.target.checked)}
                />
                Я проверил(а) карточку и подтверждаю публикацию
              </label>
              <Button
                disabled={!confirmed || !taskReady(task) || action.busy}
                onClick={() =>
                  action.run(async () => {
                    await repository.publish(task.id, confirmed);
                    action.confirm("Задача опубликована");
                  })
                }
              >
                Опубликовать задачу
              </Button>
            </>
          )}
          {!draft && (
            <div className="stack">
              <ActionLink to={`/business/tasks/${task.id}/responses`}>
                Отклики команд
              </ActionLink>
              {selected && (
                <ActionLink
                  variant="primary"
                  to={`/business/projects/${selected.id}`}
                >
                  {state.projects.some((p) => p.id === selected.id)
                    ? "Открыть проект"
                    : "Настроить и начать проект"}
                </ActionLink>
              )}
              <ActionLink to={`/catalog/${task.id}`}>
                Посмотреть в каталоге
              </ActionLink>
            </div>
          )}
        </aside>
      </div>
    </>
  );
}
function CardEditor({
  card,
  skills,
  focusField,
  busy,
  onCancel,
  onSave,
}: {
  card: TaskCard;
  skills: string[];
  focusField: keyof TaskCard;
  busy: boolean;
  onCancel: () => void;
  onSave: (card: TaskCard, skills: string[]) => void;
}) {
  const [value, setValue] = useState(card);
  const [tags, setTags] = useState(skills.join(", "));
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSave(value, tags.split(","));
      }}
    >
      <h2>Подтвердите сведения</h2>
      <label className="field">
        Название задачи
        <input
          required
          value={value.title}
          autoFocus={focusField === "title"}
          onChange={(e) => setValue({ ...value, title: e.target.value })}
        />
      </label>
      {cardFields.map((f) => (
        <label className="field" key={f.key}>
          {f.label}
          <textarea
            rows={3}
            autoFocus={focusField === f.key}
            value={value[f.key]}
            onChange={(e) => setValue({ ...value, [f.key]: e.target.value })}
          />
        </label>
      ))}
      <label className="field">
        Навыки через запятую
        <input
          value={tags}
          onChange={(e) => setTags(e.target.value)}
          placeholder="AI, Аналитика, Дизайн"
        />
      </label>
      <div className="form-actions">
        <Button disabled={busy}>Подтвердить изменения</Button>
        <Button type="button" variant="quiet" onClick={onCancel}>
          Отменить
        </Button>
      </div>
    </form>
  );
}
