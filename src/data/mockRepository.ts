import {
  BUSINESS_USER_ID,
  STUDENT_TEAM_ID,
  STUDENT_USER_ID,
  type Task,
  type WorkspaceState,
} from "../domain/models";
import {
  calculateReadiness,
  cardOf,
  emptyCard,
  questionsFor,
  taskReady,
} from "../domain/taskRules";
import { initialState } from "./fixtures";
import type { WorkspaceRepository } from "./WorkspaceRepository";

const STORAGE_KEY = "larda.workspace.v1";
export function createMockRepository(storage: Storage): WorkspaceRepository {
  let state: WorkspaceState = initialState();
  try {
    const saved = JSON.parse(
      storage.getItem(STORAGE_KEY) ?? "null",
    ) as WorkspaceState | null;
    if (
      saved?.version === 1 &&
      Array.isArray(saved.tasks) &&
      Array.isArray(saved.proposals) &&
      Array.isArray(saved.questions) &&
      Array.isArray(saved.seenProposalIds)
    )
      state = saved;
  } catch {
    /* An unavailable or old session starts with the demo fixtures. */
  }
  const listeners = new Set<() => void>();
  const commit = (next: WorkspaceState) => {
    // Save before notifying; a storage failure is shown next to the user's action.
    try {
      storage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      throw new Error(
        "Браузер не смог сохранить изменения. Освободите место для данных сайта и повторите действие.",
      );
    }
    state = next;
    listeners.forEach((listener) => listener());
  };
  const ownTask = (id: string): Task => {
    const task = state.tasks.find((t) => t.id === id);
    if (!task || task.ownerId !== BUSINESS_USER_ID)
      throw new Error("Задача не найдена в вашем кабинете.");
    return task;
  };
  const replaceTask = (task: Task) => ({
    ...state,
    tasks: state.tasks.map((t) => (t.id === task.id ? task : t)),
  });
  return {
    getSnapshot: () => state,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    async setRole(role) {
      commit({ ...state, role });
    },
    async ensureDraft() {
      const active = state.tasks.find(
        (t) => t.id === state.activeDraftId && t.publicationStatus === "draft",
      );
      if (active) return active.id;
      const id = crypto.randomUUID();
      const card = emptyCard();
      const task: Task = {
        ...card,
        ...calculateReadiness(card),
        id,
        ownerId: BUSINESS_USER_ID,
        industry: "Малый бизнес",
        rawDescription: "",
        draftCard: card,
        publicationStatus: "draft",
        executionStatus: "not_started",
        confirmedAt: null,
        publishedAt: null,
        skills: [],
      };
      commit({ ...state, activeDraftId: id, tasks: [...state.tasks, task] });
      return id;
    },
    async saveDescription(id, title, description) {
      const task = ownTask(id);
      if (task.publicationStatus !== "draft")
        throw new Error("Эта задача уже опубликована.");
      if (!title.trim() || !description.trim())
        throw new Error("Добавьте название и описание проблемы.");
      const card = {
        ...cardOf(task),
        title: title.trim(),
        context: description.trim(),
      };
      const next = replaceTask({
        ...task,
        rawDescription: description.trim(),
        draftCard: card,
        ...calculateReadiness(card),
      });
      if (!next.questions.some((q) => q.taskId === id))
        next.questions = [...next.questions, ...questionsFor(id)];
      commit(next);
    },
    async answerQuestion(id, answer) {
      const question = state.questions.find((q) => q.id === id);
      if (!question || !answer.trim())
        throw new Error("Напишите ответ, чтобы продолжить.");
      const task = ownTask(question.taskId);
      if (task.publicationStatus !== "draft")
        throw new Error("Опубликованную задачу нельзя менять в помощнике.");
      const card = { ...cardOf(task), [question.fieldKey]: answer.trim() };
      commit({
        ...replaceTask({
          ...task,
          draftCard: card,
          ...calculateReadiness(card),
        }),
        questions: state.questions.map((q) =>
          q.id === id ? { ...q, answer: answer.trim() } : q,
        ),
      });
    },
    async updateCard(id, card) {
      const task = ownTask(id);
      if (task.publicationStatus !== "draft")
        throw new Error("Эта задача уже опубликована.");
      const trimmed = Object.fromEntries(
        Object.entries(card).map(([k, v]) => [k, v.trim()]),
      ) as unknown as typeof card;
      commit({
        ...replaceTask({
          ...task,
          draftCard: trimmed,
          ...calculateReadiness(trimmed),
        }),
        questions: state.questions.map((q) =>
          q.taskId === id ? { ...q, answer: trimmed[q.fieldKey] || null } : q,
        ),
      });
    },
    async publish(id) {
      const task = ownTask(id);
      if (task.publicationStatus !== "draft")
        throw new Error("Задача уже опубликована.");
      if (!taskReady(task, state.questions))
        throw new Error(
          "Ответьте на вопросы и заполните задачу минимум на 70 баллов.",
        );
      const now = new Date().toISOString();
      commit({
        ...replaceTask({
          ...task,
          ...cardOf(task),
          draftCard: null,
          publicationStatus: "published",
          confirmedAt: now,
          publishedAt: now,
        }),
        activeDraftId: state.activeDraftId === id ? null : state.activeDraftId,
      });
    },
    async submitProposal(taskId, input) {
      const task = state.tasks.find((t) => t.id === taskId);
      if (
        !task ||
        task.publicationStatus !== "published" ||
        task.executionStatus !== "not_started" ||
        state.proposals.some(
          (p) => p.taskId === taskId && p.status === "accepted",
        )
      )
        throw new Error("Приём откликов на эту задачу завершён.");
      if (
        !state.teamMembers.some(
          (m) =>
            m.teamId === STUDENT_TEAM_ID &&
            m.userId === STUDENT_USER_ID &&
            m.role === "captain",
        )
      )
        throw new Error("Отклик отправляет капитан команды.");
      if (
        state.proposals.some(
          (p) => p.taskId === taskId && p.teamId === STUDENT_TEAM_ID,
        )
      )
        throw new Error("Ваша команда уже отправила отклик.");
      if (
        !input.solutionIdea.trim() ||
        !input.plan.trim() ||
        !Number.isInteger(input.durationDays) ||
        input.durationDays < 1
      )
        throw new Error("Заполните идею, план и срок в днях.");
      if (input.prototypeUrl && !/^https?:\/\//i.test(input.prototypeUrl))
        throw new Error("Ссылка должна начинаться с https:// или http://.");
      commit({
        ...state,
        proposals: [
          ...state.proposals,
          {
            ...input,
            id: crypto.randomUUID(),
            taskId,
            teamId: STUDENT_TEAM_ID,
            submittedBy: STUDENT_USER_ID,
            status: "pending",
            decidedBy: null,
            decidedAt: null,
            executionStatus: "not_started",
          },
        ],
      });
    },
    async decideProposal(id, status) {
      const proposal = state.proposals.find((p) => p.id === id);
      if (!proposal) throw new Error("Отклик не найден.");
      ownTask(proposal.taskId);
      if (proposal.status !== "pending")
        throw new Error("Решение по этому отклику уже принято.");
      if (
        status === "accepted" &&
        state.proposals.some(
          (p) => p.taskId === proposal.taskId && p.status === "accepted",
        )
      )
        throw new Error("Команда уже выбрана.");
      commit({
        ...state,
        proposals: state.proposals.map((p) =>
          p.id === id
            ? {
                ...p,
                status,
                decidedBy: BUSINESS_USER_ID,
                decidedAt: new Date().toISOString(),
              }
            : p,
        ),
      });
    },
    async markResponsesSeen(taskId) {
      const ids = state.proposals
        .filter((p) => p.taskId === taskId)
        .map((p) => p.id);
      if (ids.every((id) => state.seenProposalIds.includes(id))) return;
      commit({
        ...state,
        seenProposalIds: [...new Set([...state.seenProposalIds, ...ids])],
      });
    },
  };
}
