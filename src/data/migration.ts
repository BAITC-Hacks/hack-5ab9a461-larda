import type { WorkspaceState, TaskCard } from "../domain/models";
import { calculateReadiness, emptyCard } from "../domain/taskRules";
export function migrateState(value: unknown): WorkspaceState {
  const saved = value as WorkspaceState & { version: number };
  if (
    !saved ||
    ![1, 2].includes(saved.version) ||
    ![
      "users",
      "teams",
      "teamMembers",
      "tasks",
      "proposals",
      "questions",
      "seenProposalIds",
    ].every((k) =>
      Array.isArray((saved as unknown as Record<string, unknown>)[k]),
    )
  )
    throw new Error("Некорректное сохранение");
  if (saved.version === 2) {
    if (
      ![
        "projects",
        "submissions",
        "reviews",
        "xpTransactions",
        "achievements",
        "acknowledgedTransactionIds",
      ].every((k) =>
        Array.isArray((saved as unknown as Record<string, unknown>)[k]),
      )
    )
      throw new Error("Некорректное сохранение v2");
    return saved;
  }
  const normalize = (card: TaskCard) => ({ ...emptyCard(), ...card });
  return {
    ...saved,
    version: 2,
    projects: [],
    submissions: [],
    reviews: [],
    xpTransactions: [],
    achievements: [],
    acknowledgedTransactionIds: [],
    tasks: saved.tasks.map((task) => {
      const card = normalize(task);
      const draft = task.draftCard ? normalize(task.draftCard) : null;
      return {
        ...task,
        ...card,
        draftCard: draft,
        ...calculateReadiness(draft ?? card),
      };
    }),
  };
}
