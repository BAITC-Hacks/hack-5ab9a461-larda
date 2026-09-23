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
  need: "",
  targetUsers: "",
  contact: "",
  expectedResult: "",
  successCriteria: "",
  availableData: "",
  constraints: "",
  interactionFormat: "",
  feedbackProcess: "",
});
export const cardOf = (task: Task): TaskCard => {
  const source = task.draftCard ?? task;
  return Object.fromEntries(
    Object.keys(emptyCard()).map((key) => [
      key,
      source[key as keyof TaskCard] ?? "",
    ]),
  ) as unknown as TaskCard;
};
export const scoreRules: {
  field: keyof TaskCard;
  label: string;
  max: number;
}[] = [
  { field: "context", label: "Контекст", max: 10 },
  { field: "need", label: "Потребность", max: 10 },
  { field: "availableData", label: "Данные и материалы", max: 20 },
  { field: "expectedResult", label: "Ожидаемый результат", max: 15 },
  { field: "successCriteria", label: "Критерии успеха", max: 15 },
  { field: "constraints", label: "Ограничения", max: 10 },
  { field: "targetUsers", label: "Пользователи", max: 10 },
  { field: "contact", label: "Контакт", max: 5 },
  { field: "interactionFormat", label: "Формат взаимодействия", max: 5 },
];
export function calculateReadiness(card: TaskCard) {
  const items = scoreRules.map((rule) => ({
    ...rule,
    earned: card[rule.field]?.trim() ? rule.max : 0,
  }));
  const grouped = (
    field: keyof TaskCard,
    label: string,
    fields: (keyof TaskCard)[],
  ): ScoreItem => ({
    field,
    label,
    max: items
      .filter((i) => fields.includes(i.field))
      .reduce((n, i) => n + i.max, 0),
    earned: items
      .filter((i) => fields.includes(i.field))
      .reduce((n, i) => n + i.earned, 0),
  });
  const scoreBreakdown = [
    grouped("context", "Контекст и потребность", ["context", "need"]),
    ...items.filter(
      (i) =>
        !["context", "need", "contact", "interactionFormat"].includes(i.field),
    ),
    grouped("contact", "Связь с бизнесом", ["contact", "interactionFormat"]),
  ];
  return {
    scoreBreakdown,
    readinessScore: scoreBreakdown.reduce((n, i) => n + i.earned, 0),
  };
}
export const readinessBand = (score: number) =>
  score < 40
    ? "Требует уточнения"
    : score < 70
      ? "Рабочая"
      : score < 90
        ? "Готовая"
        : "Приоритетная";
export const improvements = (card: TaskCard) =>
  scoreRules
    .filter((r) => !card[r.field]?.trim())
    .sort((a, b) => b.max - a.max)
    .slice(0, 3);
export function questionsFor(taskId: string): TaskQuestion[] {
  return [
    {
      fieldKey: "expectedResult",
      question: "Что должна сделать команда?",
      hint: "Например: сделать прототип списка заявок, чтобы не переносить их вручную.",
      gain: 15,
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
      gain: 20,
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
export const taskReady = (task: Task, _questions: TaskQuestion[] = []) =>
  !!cardOf(task).title.trim() && !!cardOf(task).context.trim();

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
      label:
        task.executionStatus === "not_started"
          ? "Настроить проект"
          : "Открыть проект",
      to: `/business/projects/${responses.find((p) => p.status === "accepted")!.id}`,
      note: "Критерии, сроки и принятые результаты выбранной команды.",
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
