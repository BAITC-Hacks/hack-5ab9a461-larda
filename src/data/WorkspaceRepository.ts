import type {
  Id,
  StageInput,
  SubmissionInput,
  ReviewInput,
  ProposalInput,
  Role,
  TaskCard,
  WorkspaceState,
} from "../domain/models";

// Replace this adapter at the composition root when REST contracts are agreed.
// Features never know about sessionStorage, transport DTOs, or database tables.
export interface WorkspaceRepository {
  getSnapshot: () => WorkspaceState;
  getProgressionExample: () => WorkspaceState;
  subscribe: (listener: () => void) => () => void;
  setRole(role: Role): Promise<void>;
  ensureDraft(): Promise<Id>;
  saveDescription(id: Id, title: string, description: string): Promise<void>;
  answerQuestion(id: Id, answer: string): Promise<void>;
  updateCard(id: Id, card: TaskCard, skills?: string[]): Promise<void>;
  publish(id: Id, confirmed: boolean): Promise<void>;
  startProject(id: Id, stages: StageInput[]): Promise<void>;
  submitMilestone(
    projectId: Id,
    milestoneId: Id,
    input: SubmissionInput,
  ): Promise<void>;
  reviewSubmission(submissionId: Id, input: ReviewInput): Promise<void>;
  acknowledgeProgression(ids: Id[]): Promise<void>;
  submitProposal(taskId: Id, input: ProposalInput): Promise<void>;
  decideProposal(id: Id, status: "accepted" | "rejected"): Promise<void>;
  markResponsesSeen(taskId: Id): Promise<void>;
}
