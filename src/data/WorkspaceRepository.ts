import type {
  Id,
  ProposalInput,
  Role,
  TaskCard,
  WorkspaceState,
} from "../domain/models";

// Replace this adapter at the composition root when REST contracts are agreed.
// Features never know about sessionStorage, transport DTOs, or database tables.
export interface WorkspaceRepository {
  getSnapshot: () => WorkspaceState;
  subscribe: (listener: () => void) => () => void;
  setRole(role: Role): Promise<void>;
  ensureDraft(): Promise<Id>;
  saveDescription(id: Id, title: string, description: string): Promise<void>;
  answerQuestion(id: Id, answer: string): Promise<void>;
  updateCard(id: Id, card: TaskCard): Promise<void>;
  publish(id: Id): Promise<void>;
  submitProposal(taskId: Id, input: ProposalInput): Promise<void>;
  decideProposal(id: Id, status: "accepted" | "rejected"): Promise<void>;
  markResponsesSeen(taskId: Id): Promise<void>;
}
