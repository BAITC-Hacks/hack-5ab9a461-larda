import type { Id, Project, WorkspaceState } from "./models";
export const stages = [
  { title: "Анализ", xp: 200 },
  { title: "Прототип", xp: 300 },
  { title: "Итоговая поставка", xp: 300 },
];
export const ranks = [
  { name: "E", xp: 0, projects: 0 },
  { name: "D", xp: 1000, projects: 1 },
  { name: "C", xp: 2500, projects: 2 },
  { name: "B", xp: 5000, projects: 3 },
  { name: "A", xp: 10000, projects: 5 },
  { name: "S", xp: 20000, projects: 10 },
];
export const achievementDefinitions = [
  {
    id: "first_mission",
    name: "Первая миссия",
    icon: "◇",
    description: "Завершите первый подтверждённый проект",
    target: 1,
    reward: 100,
  },
  {
    id: "problem_solver",
    name: "Решение найдено",
    icon: "⌁",
    description: "Завершите 5 подтверждённых проектов",
    target: 5,
    reward: 300,
  },
  {
    id: "business_tested",
    name: "Проверено бизнесом",
    icon: "▱",
    description: "Завершите проекты с 3 разными бизнес-аккаунтами",
    target: 3,
    reward: 200,
  },
] as const;
export const levelAt = (xp: number) =>
  Math.floor((1 + Math.sqrt(1 + 0.08 * Math.max(0, xp))) / 2);
export const rankAt = (xp: number, completed: number) =>
  [...ranks].reverse().find((r) => xp >= r.xp && completed >= r.projects)!;
export const projectProgress = (p: Project) =>
  Math.round(
    (p.milestones.filter((m) => m.acceptedSubmissionId).length / 3) * 100,
  );
export function evidenceFor(state: WorkspaceState, userId: Id) {
  return state.reviews
    .filter(
      (r) => r.decision === "accepted" && r.confirmedUserIds.includes(userId),
    )
    .flatMap((review) => {
      const submission = state.submissions.find(
        (s) => s.id === review.submissionId,
      );
      const project = state.projects.find(
        (p) => p.id === submission?.projectId,
      );
      const contribution = submission?.contributors.find(
        (c) => c.userId === userId,
      );
      return submission && project && contribution
        ? [{ review, submission, project, contribution }]
        : [];
    });
}
export function studentProgress(state: WorkspaceState, userId: Id) {
  const evidence = evidenceFor(state, userId);
  const completed = state.projects.filter(
    (p) => p.completedAt && evidence.some((e) => e.project.id === p.id),
  );
  const companies = new Set(completed.map((p) => p.ownerId)).size;
  const xp = state.xpTransactions
    .filter((t) => t.userId === userId)
    .reduce((n, t) => n + t.amount, 0);
  const rank = rankAt(xp, completed.length);
  return {
    xp,
    level: levelAt(xp),
    rank,
    nextRank: ranks[ranks.indexOf(rank) + 1],
    completed,
    companies,
    evidence,
  };
}
export function grantAchievements(
  state: WorkspaceState,
  projectId: Id,
  now: string,
) {
  const next = {
    ...state,
    achievements: [...state.achievements],
    xpTransactions: [...state.xpTransactions],
  };
  for (const user of state.users.filter((u) => u.role === "student")) {
    const progress = studentProgress(next, user.id);
    for (const definition of achievementDefinitions) {
      const count =
        definition.id === "business_tested"
          ? progress.companies
          : progress.completed.length;
      if (
        count < definition.target ||
        next.achievements.some(
          (a) => a.userId === user.id && a.achievementId === definition.id,
        )
      )
        continue;
      next.achievements.push({
        userId: user.id,
        achievementId: definition.id,
        unlockedAt: now,
      });
      next.xpTransactions.push({
        id: `achievement:${user.id}:${definition.id}`,
        userId: user.id,
        amount: definition.reward,
        projectId,
        source: "achievement",
        sourceId: definition.id,
        createdAt: now,
      });
    }
  }
  return next;
}
export function httpUrl(value: string) {
  try {
    const u = new URL(value);
    return ["http:", "https:"].includes(u.protocol) && !!u.hostname;
  } catch {
    return false;
  }
}
