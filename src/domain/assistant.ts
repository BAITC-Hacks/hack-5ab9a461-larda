import type { TaskCard, TaskQuestion } from "./models";
import { questionsFor } from "./taskRules";
export interface AssistantInput {
  taskId: string;
  card: TaskCard;
}
export interface AssistantOutput {
  questions: { fieldKey: TaskQuestion["fieldKey"]; question: string }[];
}
export const assistantPrompt =
  "Определи недостающие сведения карточки. Верни JSON {questions:[{fieldKey,question}]} с минимум тремя вопросами. Не добавляй фактов или ответов. Используй только поля из входной схемы.";
// Only questions may leave this boundary. The assistant cannot mutate task facts or scores.
export function validateAssistant(
  input: AssistantInput,
  output: unknown,
): TaskQuestion[] {
  const fallback = questionsFor(input.taskId);
  const candidate = output as AssistantOutput;
  const allowed = [
    "need",
    "targetUsers",
    "contact",
    "expectedResult",
    "successCriteria",
    "availableData",
    "constraints",
    "interactionFormat",
    "feedbackProcess",
  ];
  if (
    !candidate ||
    !Array.isArray(candidate.questions) ||
    candidate.questions.length < 3 ||
    candidate.questions.length > 9 ||
    candidate.questions.some(
      (q) =>
        !q ||
        !allowed.includes(q.fieldKey) ||
        typeof q.question !== "string" ||
        !q.question.trim(),
    ) ||
    new Set(candidate.questions.map((q) => q.fieldKey)).size !==
      candidate.questions.length
  )
    return fallback;
  return candidate.questions.map((q, i) => ({
    ...fallback[0],
    id: `${input.taskId}-q${i + 1}`,
    position: i + 1,
    fieldKey: q.fieldKey,
    question: q.question.trim(),
    hint: "Укажите только известные вам сведения.",
    gain: 0,
  }));
}
export function localAssistant(input: AssistantInput) {
  return validateAssistant(input, {
    questions: questionsFor(input.taskId).map((q) => ({
      fieldKey: q.fieldKey,
      question: q.question,
    })),
  });
}
