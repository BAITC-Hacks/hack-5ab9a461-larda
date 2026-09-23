// Frontend domain contract. DB bigint IDs are strings to avoid precision loss.
export type Id = string;
export type Role = "business" | "student";
export type PublicationStatus = "draft" | "published" | "archived";
export type ExecutionStatus =
  "not_started" | "in_progress" | "completed" | "cancelled";
export interface User {
  id: Id;
  name: string;
  role: Role;
  companyName: string | null;
}
export interface Team {
  id: Id;
  name: string;
  description: string;
}
export interface TeamMember {
  teamId: Id;
  userId: Id;
  role: "captain" | "member";
}
export interface TaskCard {
  title: string;
  context: string;
  expectedResult: string;
  successCriteria: string;
  availableData: string;
  constraints: string;
  interactionFormat: string;
  feedbackProcess: string;
}
export interface ScoreItem {
  field: keyof TaskCard;
  label: string;
  earned: number;
  max: number;
}
export interface Task extends TaskCard {
  id: Id;
  ownerId: Id;
  industry: string;
  rawDescription: string;
  publicationStatus: PublicationStatus;
  executionStatus: ExecutionStatus;
  draftCard: TaskCard | null;
  readinessScore: number;
  scoreBreakdown: ScoreItem[];
  confirmedAt: string | null;
  publishedAt: string | null;
  skills: string[];
}
export interface TaskQuestion {
  id: Id;
  taskId: Id;
  roundNumber: number;
  position: number;
  fieldKey: Exclude<keyof TaskCard, "title" | "context">;
  question: string;
  hint: string;
  answer: string | null;
  gain: number;
}
export interface Proposal {
  id: Id;
  taskId: Id;
  teamId: Id;
  submittedBy: Id;
  solutionIdea: string;
  plan: string;
  durationDays: number;
  prototypeUrl: string;
  status: "pending" | "accepted" | "rejected";
  decidedBy: Id | null;
  decidedAt: string | null;
  executionStatus: ExecutionStatus;
}
export interface WorkspaceState {
  version: 1;
  role: Role | null;
  users: User[];
  teams: Team[];
  teamMembers: TeamMember[];
  tasks: Task[];
  questions: TaskQuestion[];
  proposals: Proposal[];
  activeDraftId: Id | null;
  seenProposalIds: Id[];
}
export type ProposalInput = Pick<
  Proposal,
  "solutionIdea" | "plan" | "durationDays" | "prototypeUrl"
>;
export const BUSINESS_USER_ID = "1";
export const STUDENT_USER_ID = "2";
export const STUDENT_TEAM_ID = "1";
