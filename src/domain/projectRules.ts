import {
  BUSINESS_USER_ID,
  STUDENT_USER_ID,
  type WorkspaceState,
  type Id,
  type StageInput,
  type SubmissionInput,
  type ReviewInput,
} from "./models";
import { stages, grantAchievements, httpUrl } from "./progression";
import { cardOf } from "./taskRules";
function requireRole(state: WorkspaceState, role: "business" | "student") {
  if (state.role !== role)
    throw new Error("Сначала выберите соответствующую роль.");
}
export function startProject(
  state: WorkspaceState,
  id: Id,
  inputs: StageInput[],
  now: string,
): WorkspaceState {
  requireRole(state, "business");
  const proposal = state.proposals.find(
    (p) => p.id === id && p.status === "accepted",
  );
  const task = state.tasks.find(
    (t) => t.id === proposal?.taskId && t.ownerId === BUSINESS_USER_ID,
  );
  if (
    !proposal ||
    !task ||
    task.executionStatus !== "not_started" ||
    state.projects.some((p) => p.id === id)
  )
    throw new Error("Этот проект нельзя запустить.");
  if (
    inputs.length !== 3 ||
    inputs.some(
      (s, i) =>
        !s.criteria.trim() ||
        !/^\d{4}-\d{2}-\d{2}$/.test(s.dueDate) ||
        !Number.isFinite(Date.parse(s.dueDate)) ||
        new Date(s.dueDate).toISOString().slice(0, 10) !== s.dueDate ||
        s.dueDate < now.slice(0, 10) ||
        (i > 0 && s.dueDate < inputs[i - 1].dueDate),
    )
  )
    throw new Error(
      "Укажите критерии и последовательные даты трёх этапов, не ранее сегодняшнего дня.",
    );
  const members = state.teamMembers
    .filter((m) => m.teamId === proposal.teamId)
    .map((m) => ({ ...m }));
  if (!members.some((m) => m.role === "captain"))
    throw new Error("В команде нет капитана.");
  return {
    ...state,
    projects: [
      ...state.projects,
      {
        id,
        taskId: task.id,
        ownerId: task.ownerId,
        teamId: proposal.teamId,
        brief: { ...cardOf(task) },
        skills: [...task.skills],
        members,
        startedAt: now,
        completedAt: null,
        milestones: inputs.map((s, i) => ({
          ...s,
          criteria: s.criteria.trim(),
          ...stages[i],
          id: `${id}:stage:${i}`,
          acceptedSubmissionId: null,
        })),
      },
    ],
    tasks: state.tasks.map((t) =>
      t.id === task.id ? { ...t, executionStatus: "in_progress" } : t,
    ),
    proposals: state.proposals.map((p) =>
      p.id === id ? { ...p, executionStatus: "in_progress" } : p,
    ),
  };
}
export function submitMilestone(
  state: WorkspaceState,
  projectId: Id,
  milestoneId: Id,
  input: SubmissionInput,
  id: Id,
  now: string,
): WorkspaceState {
  requireRole(state, "student");
  const project = state.projects.find(
    (p) => p.id === projectId && !p.completedAt,
  );
  if (
    !project?.members.some(
      (m) => m.userId === STUDENT_USER_ID && m.role === "captain",
    )
  )
    throw new Error("Результат отправляет капитан выбранной команды.");
  const current = project.milestones.find((m) => !m.acceptedSubmissionId);
  if (!current || current.id !== milestoneId)
    throw new Error("Этапы выполняются последовательно.");
  const previous = state.submissions.filter(
    (s) => s.milestoneId === milestoneId,
  );
  const last = previous.at(-1);
  if (
    last &&
    !state.reviews.some(
      (r) => r.submissionId === last.id && r.decision === "changes_requested",
    )
  )
    throw new Error("Результат уже ожидает проверки.");
  if (
    !input.summary.trim() ||
    !httpUrl(input.evidenceUrl) ||
    !input.contributors.length
  )
    throw new Error("Добавьте результат, HTTP(S) ссылку и участников.");
  if (
    new Set(input.contributors.map((c) => c.userId)).size !==
      input.contributors.length ||
    input.contributors.some(
      (c) =>
        !project.members.some((m) => m.userId === c.userId) ||
        !c.description.trim() ||
        c.skills.some((s) => !project.skills.includes(s)) ||
        new Set(c.skills).size !== c.skills.length,
    )
  )
    throw new Error("Проверьте участников, их вклад и навыки проекта.");
  return {
    ...state,
    submissions: [
      ...state.submissions,
      {
        ...input,
        summary: input.summary.trim(),
        evidenceUrl: input.evidenceUrl.trim(),
        contributors: input.contributors.map((c) => ({
          ...c,
          description: c.description.trim(),
          skills: [...c.skills],
        })),
        id,
        projectId,
        milestoneId,
        version: previous.length + 1,
        submittedBy: STUDENT_USER_ID,
        submittedAt: now,
      },
    ],
  };
}
export function reviewSubmission(
  state: WorkspaceState,
  submissionId: Id,
  input: ReviewInput,
  now: string,
): WorkspaceState {
  requireRole(state, "business");
  const submission = state.submissions.find((s) => s.id === submissionId);
  const project = state.projects.find(
    (p) => p.id === submission?.projectId && p.ownerId === BUSINESS_USER_ID,
  );
  if (!submission || !project)
    throw new Error("Результат не найден в ваших проектах.");
  if (state.reviews.some((r) => r.submissionId === submissionId)) return state; // idempotent retry, no second decision
  if (
    project.completedAt ||
    project.milestones.find((m) => !m.acceptedSubmissionId)?.id !==
      submission.milestoneId ||
    state.submissions
      .filter((s) => s.milestoneId === submission.milestoneId)
      .at(-1)?.id !== submissionId
  )
    throw new Error("Эта версия больше не ожидает проверки.");
  if (!["accepted", "changes_requested"].includes(input.decision))
    throw new Error("Неизвестное решение.");
  const accepted = input.decision === "accepted";
  const users = [...new Set(input.confirmedUserIds)];
  if (!accepted && !input.feedback.trim())
    throw new Error("Опишите, что необходимо исправить.");
  if (
    accepted &&
    (!users.length ||
      users.some((u) => !submission.contributors.some((c) => c.userId === u)))
  )
    throw new Error("Подтвердите хотя бы одного участника из результата.");
  let next: WorkspaceState = {
    ...state,
    reviews: [
      ...state.reviews,
      {
        id: `review:${submissionId}`,
        submissionId,
        decision: input.decision,
        feedback: input.feedback.trim(),
        confirmedUserIds: accepted ? users : [],
        reviewedBy: BUSINESS_USER_ID,
        reviewedAt: now,
      },
    ],
  };
  if (!accepted) return next;
  const milestone = project.milestones.find(
    (m) => m.id === submission.milestoneId,
  )!;
  const milestones = project.milestones.map((m) =>
    m.id === milestone.id ? { ...m, acceptedSubmissionId: submissionId } : m,
  );
  const complete = milestones.every((m) => m.acceptedSubmissionId);
  next = {
    ...next,
    projects: state.projects.map((p) =>
      p.id === project.id
        ? { ...p, milestones, completedAt: complete ? now : null }
        : p,
    ),
    xpTransactions: [
      ...state.xpTransactions,
      ...users.map((userId) => ({
        id: `milestone:${milestone.id}:${userId}`,
        userId,
        amount: milestone.xp,
        projectId: project.id,
        source: "milestone" as const,
        sourceId: milestone.id,
        createdAt: now,
      })),
    ],
    tasks: state.tasks.map((t) =>
      complete && t.id === project.taskId
        ? { ...t, executionStatus: "completed" }
        : t,
    ),
    proposals: state.proposals.map((p) =>
      complete && p.id === project.id
        ? { ...p, executionStatus: "completed" }
        : p,
    ),
  };
  return complete ? grantAchievements(next, project.id, now) : next;
}
