import { useEffect, useState } from "react";
import { Navigate, useSearchParams } from "react-router-dom";
import { useWorkspace } from "../../app/WorkspaceProvider";
import { cardOf } from "../../domain/taskRules";
import {
  BUSINESS_USER_ID,
  type Task,
  type TaskQuestion,
} from "../../domain/models";
import {
  ActionLink,
  Button,
  ErrorMessage,
  PageTrail,
  useAction,
} from "../../shared/ui/controls";
import { TaskBrief } from "../../shared/ui/TaskBrief";
import { AnimatedProgress } from "../../shared/motion/AnimatedProgress";
import { SaveConfirmation } from "../../shared/motion/SaveConfirmation";

export function TaskBuilder() {
  const { state, repository } = useWorkspace();
  const [params, setParams] = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const id = params.get("task");
  useEffect(() => {
    if (id) return;
    let active = true;
    repository
      .ensureDraft()
      .then((taskId) => {
        if (active) setParams({ task: taskId }, { replace: true });
      })
      .catch((e) => {
        if (active) setError(String(e));
      });
    return () => {
      active = false;
    };
  }, [id, repository, setParams]);
  const task = state.tasks.find(
    (t) => t.id === id && t.ownerId === BUSINESS_USER_ID,
  );
  if (error) return <ErrorMessage message={error} />;
  if (!id) return <p role="status">Открываем черновик…</p>;
  if (!task)
    return (
      <section className="panel">
        <h1>Черновик не найден</h1>
        <ActionLink to="/business">К рабочему столу</ActionLink>
      </section>
    );
  if (task.publicationStatus !== "draft")
    return <Navigate to={`/business/tasks/${task.id}`} replace />;
  return <Builder task={task} key={task.id} />;
}

function Builder({ task }: { task: Task }) {
  const { state, repository } = useWorkspace();
  const card = cardOf(task);
  const questions = state.questions
    .filter((q) => q.taskId === task.id)
    .sort((a, b) => a.position - b.position);
  const current = questions.find((q) => !q.answer);
  const [title, setTitle] = useState(card.title);
  const [description, setDescription] = useState(task.rawDescription);
  const [analyzing, setAnalyzing] = useState(false);
  const [editingDescription, setEditingDescription] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState<string | null>(null);
  const action = useAction();
  useEffect(() => {
    if (!analyzing) return;
    const timer = setTimeout(() => setAnalyzing(false), 800);
    return () => clearTimeout(timer);
  }, [analyzing]);
  const showDescription = !questions.length || editingDescription;
  const activeQuestion =
    questions.find((q) => q.id === editingQuestion) ?? current;
  const answer = async (question: TaskQuestion, value: string) => {
    const before = task.readinessScore;
    await repository.answerQuestion(question.id, value);
    const after = repository
      .getSnapshot()
      .tasks.find((t) => t.id === task.id)!.readinessScore;
    setEditingQuestion(null);
    action.confirm(
      `Ответ сохранён. Готовность: ${before} → ${after} (${after - before >= 0 ? "+" : ""}${after - before})`,
    );
  };
  return (
    <>
      <PageTrail title="Создание задачи" />
      <div className="page-heading">
        <div>
          <p className="overline">Создать задачу</p>
          <h1>
            {showDescription
              ? "С чем вам нужна помощь?"
              : "Уточним несколько деталей"}
          </h1>
          <p className="intro">
            {showDescription
              ? "Опишите ситуацию так, как рассказали бы коллеге."
              : "Один вопрос за раз. Ваши ответы станут карточкой для команды."}
          </p>
        </div>
        <span className="status status--pending">Черновик</span>
      </div>
      <ActionLink to={`/business/tasks/${task.id}`}>
        Проверить карточку · можно оставить уточнения на потом
      </ActionLink>
      <ol className="stepper" aria-label="Шаги создания">
        <li className={!questions.length ? "current" : "done"}>
          1. Опишите проблему
        </li>
        <li
          className={
            questions.length && current
              ? "current"
              : !current && questions.length
                ? "done"
                : ""
          }
        >
          2. Уточните детали
        </li>
        <li className={questions.length && !current ? "current" : ""}>
          3. Проверьте и опубликуйте
        </li>
      </ol>
      <div className="workspace-grid">
        <section className="builder-main">
          {showDescription ? (
            <form
              className="panel"
              onSubmit={(e) => {
                e.preventDefault();
                void action.run(async () => {
                  await repository.saveDescription(task.id, title, description);
                  setEditingDescription(false);
                  setAnalyzing(true);
                });
              }}
            >
              <label className="field">
                Короткое название задачи
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Например: учёт заявок из WhatsApp"
                  maxLength={160}
                  required
                />
              </label>
              <label className="field">
                Опишите проблему
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Что вы сейчас делаете вручную? Что отнимает время или мешает работать?"
                  rows={6}
                  required
                />
              </label>
              <p className="field-help">
                Технические термины не нужны. Важно, что происходит у вас в
                работе.
              </p>
              <ErrorMessage message={action.error} />
              <div className="form-actions">
                <Button disabled={action.busy}>
                  Сохранить и продолжить <span aria-hidden="true">→</span>
                </Button>
                {questions.length > 0 && (
                  <Button
                    variant="quiet"
                    type="button"
                    onClick={() => setEditingDescription(false)}
                  >
                    Отменить
                  </Button>
                )}
              </div>
            </form>
          ) : analyzing ? (
            <section
              className="panel processing"
              role="status"
              aria-live="polite"
            >
              <span className="processing-dot" />
              <h2>Помощник изучает описание…</h2>
              <p>Готовим вопросы, которые помогут команде понять задачу.</p>
            </section>
          ) : (
            <>
              <div className="helper-note">
                <span className="helper-icon" aria-hidden="true">
                  ?
                </span>
                <div>
                  <strong>Помощник по заполнению</strong>
                  <p>
                    В этом прототипе вопросы подготовлены заранее. В карточку
                    попадут только ваши ответы.
                  </p>
                </div>
              </div>
              <div className="question-progress">
                <span>
                  {current
                    ? `Вопрос ${current.position} из ${questions.length}`
                    : `Все ${questions.length} ответа сохранены`}
                </span>
                <Button
                  variant="quiet"
                  onClick={() => setEditingDescription(true)}
                >
                  Изменить описание
                </Button>
              </div>
              <AnimatedProgress
                value={questions.filter((q) => q.answer).length}
                max={questions.length}
                label="Ответов сохранено"
                compact
              />
              <div className="saved-answers">
                {questions
                  .filter((q) => q.answer && q.id !== editingQuestion)
                  .map((q) => (
                    <details
                      key={q.id}
                      className="saved-answer motion-answer-saved"
                    >
                      <summary>
                        <span aria-hidden="true">✓</span>
                        {q.question}
                      </summary>
                      <p>{q.answer}</p>
                      <Button
                        variant="quiet"
                        onClick={() => setEditingQuestion(q.id)}
                      >
                        Изменить ответ
                      </Button>
                    </details>
                  ))}
              </div>
              <SaveConfirmation message={action.message} />
              {activeQuestion ? (
                <QuestionForm
                  key={activeQuestion.id}
                  question={activeQuestion}
                  busy={action.busy}
                  onSave={(value) =>
                    action.run(() => answer(activeQuestion, value))
                  }
                />
              ) : (
                <section className="panel ready-panel motion-question-enter">
                  <span className="status status--success">Детали собраны</span>
                  <h2>Теперь проверим вашу задачу</h2>
                  <p>Вы сможете поправить формулировки перед публикацией.</p>
                  <ActionLink
                    to={`/business/tasks/${task.id}`}
                    variant="primary"
                  >
                    Проверить задачу <span aria-hidden="true">→</span>
                  </ActionLink>
                </section>
              )}
              <ErrorMessage message={action.error} />
            </>
          )}
        </section>
        <aside className="panel task-preview">
          <p className="overline">Ваша задача</p>
          <h2>{card.title || "Здесь появится ваша задача"}</h2>
          <AnimatedProgress
            value={task.readinessScore}
            label="Готовность задачи"
          />
          <p className="field-help">
            {task.readinessScore >= 70
              ? "Задача хорошо подготовлена для команды."
              : "Ответы помогут команде предложить реалистичное решение."}
          </p>
          <TaskBrief card={card} compact />
        </aside>
      </div>
    </>
  );
}

function QuestionForm({
  question,
  onSave,
  busy,
}: {
  question: TaskQuestion;
  onSave: (answer: string) => void;
  busy: boolean;
}) {
  const [value, setValue] = useState(question.answer ?? "");
  return (
    <form
      className="panel question-card motion-question-enter"
      onSubmit={(e) => {
        e.preventDefault();
        onSave(value);
      }}
    >
      <div className="question-card__top">
        <span className="overline">Уточнение {question.position}</span>
        <span className="score-gain">Заполнение карточки</span>
      </div>
      <label className="field">
        <span className="question-title">{question.question}</span>
        <span className="field-help">{question.hint}</span>
        <textarea
          rows={4}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          required
          autoFocus
        />
      </label>
      <Button disabled={busy || !value.trim()}>
        Сохранить и продолжить <span aria-hidden="true">→</span>
      </Button>
    </form>
  );
}
