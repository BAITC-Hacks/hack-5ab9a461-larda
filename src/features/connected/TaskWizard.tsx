import { useEffect, useRef, useState } from "react";
import type {
  ServerCard,
  ServerQuestion,
  ServerTask,
} from "../../data/backendClient";
import { Button, ErrorMessage } from "../../shared/ui/controls";

export interface TaskWizardProps {
  task: ServerTask | null;
  questions: ServerQuestion[];
  busy: boolean;
  waiting: boolean;
  onCreate: (description: string) => Promise<void>;
  onAnswers: (
    answers: { question_id: number; answer: string }[],
  ) => Promise<void>;
  onSave: (changes: Partial<ServerCard>) => Promise<void>;
  onConfirm: () => Promise<void>;
  onPublish: () => Promise<void>;
  onRetry: () => Promise<void>;
  onBack: () => void;
}

const labels: Record<keyof ServerCard, string> = {
  title: "Название",
  context: "Контекст",
  need: "Потребность",
  expected_result: "Ожидаемый результат",
  success_criteria: "Критерии успеха",
  available_data: "Данные",
  target_users: "Целевые пользователи",
  constraints: "Ограничения",
  contact: "Контакт",
  interaction_format: "Формат взаимодействия",
  feedback_process: "Обратная связь",
};
const essential: (keyof ServerCard)[] = [
  "title",
  "context",
  "need",
  "expected_result",
  "success_criteria",
];
const additional = (Object.keys(labels) as (keyof ServerCard)[]).filter(
  (key) => !essential.includes(key),
);
const steps = ["Описание", "Уточнения", "Карточка", "Публикация"];

function initialStep(task: ServerTask | null, questions: ServerQuestion[]) {
  if (!task) return 0;
  if (task.publication_status === "published") return 2;
  if (task.confirmed_at && !task.draft_card) return 3;
  if (questions.some((question) => !question.answer?.trim())) return 1;
  // Creation already returns a draft_card, before its question job completes.
  if (!questions.length && task.ai_status !== "succeeded") return 1;
  if (task.draft_card) return 2;
  return 1;
}

/** Navigation changes only local state. Server operations are explicit and awaited. */
export function TaskWizard({
  task,
  questions,
  busy,
  waiting,
  onCreate,
  onAnswers,
  onSave,
  onConfirm,
  onPublish,
  onRetry,
  onBack,
}: TaskWizardProps) {
  const [step, setStep] = useState(() => initialStep(task, questions));
  const [description, setDescription] = useState(task?.raw_description ?? "");
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [questionIndex, setQuestionIndex] = useState(0);
  const [edits, setEdits] = useState<Record<string, Partial<ServerCard>>>({});
  const [confirmedKey, setConfirmedKey] = useState<string | null>(null);
  const [published, setPublished] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const running = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus();
  }, [step, questionIndex]);

  const locked = busy || pending;
  const processing =
    waiting || (!!task && ["pending", "running"].includes(task.ai_status));
  const question =
    questions[Math.min(questionIndex, Math.max(0, questions.length - 1))];
  const answered =
    questions.length > 0 && questions.every((q) => q.answer?.trim());
  const answerFor = (q: ServerQuestion) => answers[q.id] ?? q.answer ?? "";
  const answersChanged = questions.some(
    (q) => answerFor(q).trim() !== (q.answer ?? "").trim(),
  );
  const baseCard = task?.draft_card ?? task;
  const editKey = task
    ? `${task.id}:${task.revision}:${!!task.draft_card}`
    : "new";
  const draft = { ...baseCard, ...edits[editKey] } as Partial<ServerCard>;
  const changes: Partial<ServerCard> = Object.fromEntries(
    (Object.keys(labels) as (keyof ServerCard)[])
      .filter((key) => (draft[key] ?? "").trim() !== (baseCard?.[key] ?? ""))
      .map((key) => [key, (draft[key] ?? "").trim()]),
  );
  const hasChanges = Object.keys(changes).length > 0;
  const revisionKey = task ? `${task.id}:${task.revision}` : "";
  const source = task?.draft_card
    ? task.draft_evaluation?.source
    : task?.score_breakdown?.source;
  const score = task?.draft_card
    ? task.draft_evaluation?.score
    : task?.readiness_score;
  const canConfirm =
    !!task?.draft_card &&
    !!task.draft_evaluation &&
    task.evaluated_revision === task.revision &&
    task.ai_status === "succeeded";

  async function perform(operation: () => Promise<void>, after?: () => void) {
    if (running.current || busy) return;
    running.current = true;
    setPending(true);
    setError(null);
    try {
      await operation();
      after?.();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Не удалось сохранить. Попробуйте ещё раз.",
      );
    } finally {
      running.current = false;
      setPending(false);
    }
  }
  function back() {
    setError(null);
    if (step === 1 && questionIndex > 0) setQuestionIndex(questionIndex - 1);
    else if (step > 0) setStep(step - 1);
    else onBack();
  }
  function editField(key: keyof ServerCard) {
    return (
      <label className="field" key={key}>
        {labels[key]}
        {key === "title" ? (
          <input
            required
            value={draft[key] ?? ""}
            disabled={locked || processing}
            onChange={(event) => updateField(key, event.target.value)}
          />
        ) : (
          <textarea
            rows={3}
            value={draft[key] ?? ""}
            disabled={locked || processing}
            onChange={(event) => updateField(key, event.target.value)}
          />
        )}
      </label>
    );
  }
  function updateField(key: keyof ServerCard, value: string) {
    setEdits((current) => ({
      ...current,
      [editKey]: { ...current[editKey], [key]: value },
    }));
    setConfirmedKey(null);
  }

  return (
    <section className="flow-card" aria-label="Создание задачи">
      <header className="flow-header">
        <Button
          className="flow-back"
          variant="quiet"
          disabled={locked}
          onClick={back}
        >
          ← Назад
        </Button>
        <span className="field-help">
          Шаг {step + 1} из {steps.length}
        </span>
      </header>
      <ol className="flow-stepper" aria-label="Этапы создания задачи">
        {steps.map((label, index) => (
          <li key={label} aria-current={step === index ? "step" : undefined}>
            <span aria-hidden="true">{index + 1}</span> {label}
          </li>
        ))}
      </ol>
      <h2 ref={heading} tabIndex={-1}>
        {
          [
            "Какую проблему решаем?",
            "Уточним детали",
            "Проверьте карточку",
            "Всё готово к публикации",
          ][step]
        }
      </h2>
      <ErrorMessage message={error} />
      {task?.ai_status === "failed" && (
        <div className="inline-notice">
          <ErrorMessage
            message={
              task.ai_error ||
              "Не удалось подготовить задачу. Описание сохранено."
            }
          />
          <Button
            variant="secondary"
            disabled={locked}
            onClick={() => void perform(onRetry)}
          >
            Повторить AI-анализ
          </Button>
        </div>
      )}
      {processing && step !== 0 && (
        <div className="inline-notice ai-waiting" role="status">
          <span className="ai-waiting__spinner" aria-hidden="true" />
          <span>
            {step === 1
              ? "Помощник готовит уточняющие вопросы…"
              : "Помощник готовит карточку и оценку…"}
            <span className="ai-waiting__hint">
              Задача сохранена — подождите немного.
            </span>
          </span>
        </div>
      )}

      {step === 0 && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (task) {
              setStep(1);
              return;
            }
            if (!description.trim()) {
              setError("Опишите бизнес-проблему.");
              return;
            }
            void perform(
              () => onCreate(description.trim()),
              () => setStep(1),
            );
          }}
        >
          <p>
            Расскажите о ситуации и о том, что хотите изменить. Помощник задаст
            уточняющие вопросы.
          </p>
          <label className="field">
            Описание бизнес-проблемы
            <textarea
              rows={6}
              required
              readOnly={!!task}
              disabled={locked}
              value={task?.raw_description ?? description}
              placeholder="Например: мы ведём заказы в таблицах и часто теряем обращения. Хотим собрать их в одном месте."
              onChange={(event) => setDescription(event.target.value)}
            />
          </label>
          {task && (
            <p className="field-help">
              Описание уже сохранено. Уточнить формулировки можно на шаге
              «Карточка».
            </p>
          )}
          <div className="flow-actions">
            <Button disabled={locked || (!task && !description.trim())}>
              {task ? "К уточнениям" : "Создать и запустить анализ"}
            </Button>
          </div>
        </form>
      )}

      {step === 1 &&
        !processing &&
        (question ? (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (!answerFor(question).trim()) {
                setError(
                  "Ответьте на вопрос. Если данных нет, так и напишите.",
                );
                return;
              }
              setError(null);
              if (questionIndex < questions.length - 1) {
                setQuestionIndex(questionIndex + 1);
                return;
              }
              if (answered && !answersChanged) {
                setStep(2);
                return;
              }
              const missing = questions.findIndex((q) => !answerFor(q).trim());
              if (missing >= 0) {
                setQuestionIndex(missing);
                setError("Ответьте на все уточнения.");
                return;
              }
              void perform(
                () =>
                  onAnswers(
                    questions.map((q) => ({
                      question_id: q.id,
                      answer: answerFor(q).trim(),
                    })),
                  ),
                () => setStep(2),
              );
            }}
          >
            <p className="field-help">
              Вопрос {questionIndex + 1} из {questions.length}
            </p>
            <label className="field" key={question.id}>
              {question.question}
              <textarea
                rows={5}
                required
                disabled={locked}
                value={answerFor(question)}
                onChange={(event) =>
                  setAnswers((current) => ({
                    ...current,
                    [question.id]: event.target.value,
                  }))
                }
              />
            </label>
            <p className="field-help">
              {answered
                ? "Ответы сохранены. Если изменить их, помощник подготовит новую версию карточки после последнего вопроса."
                : "Не знаете ответ? Укажите, что это нужно уточнить. Ответы отправятся вместе после последнего вопроса."}
            </p>
            <div className="flow-actions">
              <Button disabled={locked || !answerFor(question).trim()}>
                {questionIndex < questions.length - 1
                  ? "Следующий вопрос"
                  : answered && !answersChanged
                    ? "К карточке"
                    : "Подготовить карточку"}
              </Button>
            </div>
          </form>
        ) : task?.draft_card || task?.confirmed_at ? (
          <div className="flow-actions">
            <Button onClick={() => setStep(2)}>К карточке</Button>
          </div>
        ) : task?.ai_status !== "failed" ? (
          <p className="field-help">
            Уточняющие вопросы ещё не готовы. Обновите задачу через несколько
            секунд.
          </p>
        ) : null)}

      {step === 2 && task && !processing && baseCard && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (!draft.title?.trim()) {
              setError("Добавьте название задачи.");
              return;
            }
            if (hasChanges) {
              void perform(() => onSave(changes));
              return;
            }
            if (!task.draft_card && task.confirmed_at) {
              setStep(3);
              return;
            }
            if (!canConfirm || confirmedKey !== revisionKey) return;
            void perform(onConfirm, () => setStep(3));
          }}
        >
          <p>
            Это описание увидят команды. Проверьте факты и сформулируйте
            понятный результат.
          </p>
          <aside className="flow-aside">
            <strong>
              {score == null
                ? "Оценка этой версии ещё не готова"
                : `Готовность карточки: ${score}%`}
            </strong>
            <p className="field-help">
              {source === "fallback"
                ? "Локальная проверка заполненности. Внешняя модель для этой оценки не использовалась."
                : source === "openai"
                  ? "Оценка ИИ. Решение о публикации и проверка фактов остаются за вами."
                  : "Проверьте содержание перед публикацией."}
            </p>
          </aside>
          {essential.map(editField)}
          <details>
            <summary>Данные, участники и условия</summary>
            {additional.map(editField)}
          </details>
          {task.draft_card && !hasChanges && (
            <label className="confirmation-field">
              <input
                type="checkbox"
                checked={confirmedKey === revisionKey}
                disabled={locked || !canConfirm}
                onChange={(event) =>
                  setConfirmedKey(event.target.checked ? revisionKey : null)
                }
              />{" "}
              Я проверил факты в карточке
            </label>
          )}
          {hasChanges && (
            <p className="field-help">
              Сначала сохраните изменения — помощник обновит оценку.
            </p>
          )}
          <div className="flow-actions">
            <Button
              disabled={
                locked ||
                !draft.title?.trim() ||
                (!hasChanges &&
                  !!task.draft_card &&
                  (!canConfirm || confirmedKey !== revisionKey))
              }
            >
              {hasChanges
                ? "Сохранить правки и оценить"
                : task.draft_card
                  ? "Подтвердить карточку"
                  : "К публикации"}
            </Button>
          </div>
        </form>
      )}

      {step === 3 &&
        task &&
        (published || task.publication_status === "published" ? (
          <div>
            <p className="status status--success" role="status">
              Задача опубликована
            </p>
            <h3>{task.title}</h3>
            <p>
              Команды видят её в каталоге и могут предложить решение. Новые
              заявки появятся в вашем кабинете.
            </p>
            <div className="flow-actions">
              <Button onClick={onBack}>К моим задачам</Button>
            </div>
          </div>
        ) : !task.draft_card && task.confirmed_at ? (
          <div>
            <h3>{task.title}</h3>
            <p>{task.expected_result || task.context}</p>
            <p className="field-help">
              После публикации задача станет доступна студенческим командам. До
              начала работы карточку можно уточнить.
            </p>
            <div className="flow-actions">
              <Button
                disabled={locked || processing}
                onClick={() =>
                  void perform(onPublish, () => setPublished(true))
                }
              >
                Опубликовать задачу
              </Button>
            </div>
          </div>
        ) : (
          <div>
            <p>Перед публикацией проверьте и подтвердите текущую карточку.</p>
            <Button
              variant="secondary"
              disabled={locked}
              onClick={() => setStep(2)}
            >
              Проверить карточку
            </Button>
          </div>
        ))}
      {step > 0 &&
        !(
          step === 3 &&
          (published || task?.publication_status === "published")
        ) && (
          <Button
            className="flow-exit"
            variant="quiet"
            disabled={locked}
            onClick={onBack}
          >
            Вернуться к списку задач
          </Button>
        )}
    </section>
  );
}
