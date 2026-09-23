import type {
  Task,
  TaskCard,
  TaskQuestion,
  Proposal,
  ScoreItem,
} from "./models";

export const emptyCard = (): TaskCard => ({
  title: "",
  context: "",
  expectedResult: "",
  successCriteria: "",
  availableData: "",
  constraints: "",
  interactionFormat: "",
  feedbackProcess: "",
});
export const cardOf = (task: Task): TaskCard => task.draftCard ?? task;
export const scoreRules: {
  field: keyof TaskCard;
  label: string;
  max: number;
}[] = [
  { field: "context", label: "Описание проблемы", max: 25 },
  { field: "expectedResult", label: "Ожидаемый результат", max: 20 },
  { field: "successCriteria", label: "Критерий результата", max: 15 },
  { field: "availableData", label: "Данные от компании", max: 15 },
  { field: "constraints", label: "Ограничения", max: 10 },
  { field: "interactionFormat", label: "Формат работы", max: 10 },
  { field: "feedbackProcess", label: "Порядок обратной связи", max: 5 },
];
// Mock policy: completeness only. Production score must come from the API.
export function calculateReadiness(card: TaskCard) {
  const scoreBreakdown: ScoreItem[] = scoreRules.map((rule) => ({
    ...rule,
    earned: card[rule.field].trim() ? rule.max : 0,
  }));
  return {
    scoreBreakdown,
    readinessScore: scoreBreakdown.reduce((sum, item) => sum + item.earned, 0),
  };
}
export function questionsFor(taskId: string): TaskQuestion[] {
  return [
    {
      fieldKey: "expectedResult",
      question: "Что должна сделать команда?",
      hint: "Например: сделать прототип списка заявок, чтобы не переносить их вручную.",
      gain: 20,
    },
    {
      fieldKey: "successCriteria",
      question: "Как вы поймёте, что задача решена?",
      hint: "Например: каждое тестовое обращение появляется в списке без ручного копирования.",
      gain: 15,
    },
    {
      fieldKey: "availableData",
      question: "Какие данные вы можете предоставить?",
      hint: "Например: Excel-таблицу и обезличенные сообщения. Если данных нет, так и напишите.",
      gain: 15,
    },
  ].map((item, index) => ({
    ...item,
    fieldKey: item.fieldKey as TaskQuestion["fieldKey"],
    id: `${taskId}-q${index + 1}`,
    taskId,
    position: index + 1,
    roundNumber: 1,
    answer: null,
  }));
}
export const taskReady = (task: Task, questions: TaskQuestion[]) =>
  task.readinessScore >= 70 &&
  !!cardOf(task).title.trim() &&
  questions
    .filter((q) => q.taskId === task.id)
    .every((q) => !!q.answer?.trim());

export function nextAction(
  task: Task,
  proposals: Proposal[],
  questions: TaskQuestion[],
) {
  const responses = proposals.filter((p) => p.taskId === task.id);
  const base = `/business/tasks/${task.id}`;
  if (task.publicationStatus === "draft")
    return taskReady(task, questions)
      ? {
          rank: 1,
          label: "Опубликовать задачу",
          to: base,
          note: "Детали собраны. Проверьте карточку — и команды смогут откликнуться.",
        }
      : {
          rank: 0,
          label: "Продолжить создание задачи",
          to: `/business/new?task=${task.id}`,
          note: "Сохранённый черновик ждёт вас. Помощник уточнит оставшиеся детали.",
        };
  if (responses.some((p) => p.status === "accepted"))
    return {
      rank: 4,
      label: "Посмотреть выбранную команду",
      to: `${base}/responses`,
      note: "Решение сохранено. Идея и план выбранной команды — в откликах.",
    };
  if (responses.some((p) => p.status === "pending"))
    return {
      rank: 2,
      label: `Посмотреть отклики · ${responses.filter((p) => p.status === "pending").length}`,
      to: `${base}/responses`,
      note: "Команды предложили свои решения. Сравните планы и выберите подходящий.",
    };
  return {
    rank: 3,
    label: "Посмотреть задачу",
    to: base,
    note: "Задача опубликована. Здесь появятся отклики команд.",
  };
}
