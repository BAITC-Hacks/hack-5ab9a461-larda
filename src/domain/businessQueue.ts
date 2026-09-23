import { BUSINESS_USER_ID, type WorkspaceState } from "./models";
import { cardOf } from "./taskRules";
import { projectProgress } from "./progression";
export function businessQueue(state: WorkspaceState, today: string) {
  const items: {
    id: string;
    priority: number;
    title: string;
    detail: string;
    action: string;
    to: string;
    date: string;
    team: string;
    progress?: number;
  }[] = [];
  for (const task of state.tasks.filter(
    (t) => t.ownerId === BUSINESS_USER_ID,
  )) {
    const proposal = state.proposals.find(
      (p) => p.taskId === task.id && p.status === "accepted",
    );
    const project = state.projects.find((p) => p.taskId === task.id);
    const team =
      state.teams.find((t) => t.id === proposal?.teamId)?.name ??
      "Команда ещё не выбрана";
    const base = { title: cardOf(task).title || "Новый черновик", team };
    const pending = state.proposals.filter(
      (p) => p.taskId === task.id && p.status === "pending",
    );
    if (pending.length)
      items.push({
        ...base,
        id: `proposals:${task.id}`,
        priority: 2,
        detail: `Отклики ожидают решения: ${pending.length}`,
        action: "Рассмотреть отклики",
        to: `/business/tasks/${task.id}/responses`,
        date: "",
      });
    if (project) {
      const current = project.milestones.find((m) => !m.acceptedSubmissionId);
      const submission = state.submissions
        .filter(
          (s) => s.projectId === project.id && s.milestoneId === current?.id,
        )
        .at(-1);
      const review =
        submission &&
        state.reviews.find((r) => r.submissionId === submission.id);
      const awaiting = !!submission && !review;
      const overdue = !!current && current.dueDate < today;
      items.push({
        ...base,
        id: project.id,
        priority: awaiting ? 0 : overdue ? 1 : project.completedAt ? 5 : 4,
        detail: awaiting
          ? "Результат ожидает вашей проверки"
          : overdue
            ? "Срок этапа прошёл"
            : project.completedAt
              ? "Все результаты приняты"
              : `В работе: ${current?.title}`,
        action: awaiting ? "Проверить результат" : "Открыть проект",
        to: `/business/projects/${project.id}`,
        date: current?.dueDate ?? project.completedAt?.slice(0, 10) ?? "",
        progress: projectProgress(project),
      });
    } else {
      items.push({
        ...base,
        id: task.id,
        priority: 3,
        detail: proposal
          ? "Команда выбрана. Зафиксируйте критерии и сроки."
          : task.publicationStatus === "draft"
            ? "Подтвердите карточку для публикации."
            : `Готовность ${task.readinessScore}/100${task.readinessScore < 100 ? " · есть недостающие сведения" : ""}`,
        action: proposal
          ? "Настроить проект"
          : task.publicationStatus === "draft"
            ? "Проверить и опубликовать"
            : "Улучшить задачу",
        to: proposal
          ? `/business/projects/${proposal.id}`
          : `/business/tasks/${task.id}`,
        date: "",
      });
    }
  }
  return items.sort(
    (a, b) =>
      a.priority - b.priority ||
      (a.date || "9999").localeCompare(b.date || "9999") ||
      a.id.localeCompare(b.id),
  );
}
