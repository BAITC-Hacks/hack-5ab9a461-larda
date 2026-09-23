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
  need: string;
  targetUsers: string;
  contact: string;
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
  version: 2;
  projects: Project[];
  submissions: Submission[];
  reviews: Review[];
  xpTransactions: XpTransaction[];
  achievements: AchievementUnlock[];
  acknowledgedTransactionIds: Id[];
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

export interface StageInput {
  criteria: string;
  dueDate: string;
}
export interface Milestone extends StageInput {
  id: Id;
  title: string;
  xp: number;
  acceptedSubmissionId: Id | null;
}
export interface Project {
  id: Id;
  taskId: Id;
  ownerId: Id;
  teamId: Id;
  brief: TaskCard;
  skills: string[];
  members: TeamMember[];
  milestones: Milestone[];
  startedAt: string;
  completedAt: string | null;
}
export interface Contribution {
  userId: Id;
  description: string;
  skills: string[];
}
export interface SubmissionInput {
  summary: string;
  evidenceUrl: string;
  contributors: Contribution[];
}
export interface Submission extends SubmissionInput {
  id: Id;
  projectId: Id;
  milestoneId: Id;
  version: number;
  submittedBy: Id;
  submittedAt: string;
}
export interface Review {
  id: Id;
  submissionId: Id;
  decision: "accepted" | "changes_requested";
  feedback: string;
  confirmedUserIds: Id[];
  reviewedBy: Id;
  reviewedAt: string;
}
export interface ReviewInput {
  decision: Review["decision"];
  feedback: string;
  confirmedUserIds: Id[];
}
export interface XpTransaction {
  id: Id;
  userId: Id;
  amount: number;
  projectId: Id;
  source: "milestone" | "achievement";
  sourceId: Id;
  createdAt: string;
}
export type AchievementId =
  "first_mission" | "problem_solver" | "business_tested";
export interface AchievementUnlock {
  userId: Id;
  achievementId: AchievementId;
  unlockedAt: string;
}
