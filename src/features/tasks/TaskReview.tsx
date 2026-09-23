import { useState } from "react";
import { useParams } from "react-router-dom";
import { useWorkspace } from "../../app/WorkspaceProvider";
import { BUSINESS_USER_ID, type TaskCard } from "../../domain/models";
import { cardOf, taskReady } from "../../domain/taskRules";
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
  const task = state.tasks.find(
    (t) => t.id === id && t.ownerId === BUSINESS_USER_ID,
  );
  const [editing, setEditing] = useState(false);
  const action = useAction();
  if (!task)
    return (
      <EmptyState title="Задача не найдена">
        <ActionLink to="/business/tasks">К моим задачам</ActionLink>
      </EmptyState>
    );
  const card = cardOf(task);
  const draft = task.publicationStatus === "draft";
  const selected = state.proposals.some(
    (p) => p.taskId === id && p.status === "accepted",
  );
  return (
    <>
      <PageTrail title={card.title || "Проверка задачи"} />
      <div className="page-heading">
        <div>
          <p className="overline">
            {draft ? "Шаг 3 · Проверка задачи" : "Моя задача"}
          </p>
          <h1>{draft ? "Всё верно? Можно публиковать" : card.title}</h1>
          <p className="intro">
            {draft
              ? "Так студенты увидят вашу задачу. Проверьте детали перед публикацией."
              : "Задача доступна в каталоге. Решение о команде принимаете вы."}
          </p>
        </div>
        <TaskStatus task={task} selected={selected} />
      </div>
      <div className="workspace-grid">
        <section className="panel">
          {editing ? (
            <CardEditor
              card={card}
              busy={action.busy}
              onCancel={() => setEditing(false)}
              onSave={(value) =>
                action.run(async () => {
                  await repository.updateCard(task.id, value);
                  setEditing(false);
                  action.confirm("Изменения сохранены");
                })
              }
            />
          ) : (
            <>
              <div className="section-heading">
                <h2>{card.title || "Новая задача"}</h2>
                {draft && (
                  <Button variant="quiet" onClick={() => setEditing(true)}>
                    Изменить
                  </Button>
                )}
              </div>
              <TaskBrief card={card} />
            </>
          )}
          <ErrorMessage message={action.error} />
          <SaveConfirmation message={action.message} />
        </section>
        <aside className="panel task-preview">
          <AnimatedProgress
            value={task.readinessScore}
            label="Готовность задачи"
          />
          <p className="field-help">
            Чем полнее задача, тем выше она в каталоге. Для публикации нужно от
            70 баллов.
          </p>
          <div className="score-breakdown">
            {task.scoreBreakdown.map((item) => (
              <div key={item.field}>
                <span>{item.label}</span>
                <strong>
                  {item.earned} / {item.max}
                </strong>
              </div>
            ))}
          </div>
          {draft && !editing && (
            <>
              <div className="improvement">
                <strong>Можно улучшить</strong>
                <p>
                  {task.scoreBreakdown.find((i) => !i.earned)?.label ??
                    "Все основные сведения заполнены"}
                </p>
                <Button variant="quiet" onClick={() => setEditing(true)}>
                  Дополнить сведения →
                </Button>
              </div>
              <Button
                className="full-width"
                disabled={!taskReady(task, state.questions) || action.busy}
                onClick={() =>
                  action.run(async () => {
                    await repository.publish(task.id);
                    action.confirm("Задача опубликована");
                  })
                }
              >
                Опубликовать задачу
              </Button>
              {!taskReady(task, state.questions) && (
                <ActionLink
                  to={`/business/new?task=${task.id}`}
                  variant="quiet"
                >
                  Вернуться к уточнениям
                </ActionLink>
              )}
            </>
          )}
          {!draft && (
            <div className="stack">
              <p className="success-copy">✓ Задача опубликована</p>
              <ActionLink
                variant="primary"
                to={`/business/tasks/${task.id}/responses`}
              >
                {selected ? "Посмотреть выбранную команду" : "Отклики команд"}
              </ActionLink>
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
  busy,
  onSave,
  onCancel,
}: {
  card: TaskCard;
  busy: boolean;
  onSave: (card: TaskCard) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(card);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSave(value);
      }}
    >
      <h2>Изменить сведения</h2>
      <label className="field">
        Название задачи
        <input
          value={value.title}
          onChange={(e) => setValue({ ...value, title: e.target.value })}
          required
        />
      </label>
      {cardFields.map((field) => (
        <label className="field" key={field.key}>
          {field.label}
          <textarea
            rows={3}
            value={value[field.key]}
            onChange={(e) =>
              setValue({ ...value, [field.key]: e.target.value })
            }
          />
        </label>
      ))}
      <div className="form-actions">
        <Button disabled={busy}>Сохранить изменения</Button>
        <Button variant="quiet" type="button" onClick={onCancel}>
          Отменить
        </Button>
      </div>
    </form>
  );
}
