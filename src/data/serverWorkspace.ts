import {
  BackendError,
  createBackendClient,
  type ServerUser,
  type ServerTeam,
  type ServerTask,
  type ServerProfile,
  type ServerProposal,
  type ServerQuestion,
  type ServerAchievement,
} from "./backendClient";

export interface RemoteWorkspace {
  tasks: ServerTask[];
  teams: ServerTeam[];
  profile: ServerProfile | null;
  proposals: ServerProposal[];
  task: ServerTask | null;
  questions: ServerQuestion[];
  achievements: ServerAchievement[];
}
export const emptyRemoteWorkspace = (): RemoteWorkspace => ({
  tasks: [],
  teams: [],
  profile: null,
  proposals: [],
  task: null,
  questions: [],
  achievements: [],
});
export async function connectWorkspace(address: string, signal?: AbortSignal) {
  const api = createBackendClient(address, undefined, signal);
  const [users, teams, runtime] = await Promise.all([
    api<ServerUser[]>("/users"),
    api<ServerTeam[]>("/teams"),
    api<unknown>("/runtime").catch((error) => {
      if (error instanceof BackendError && error.status === 404)
        return { ai_mode: "unknown" };
      // Runtime metadata is optional on older deployments, resource requests remain authoritative.
      if (signal?.aborted) throw error;
      return { ai_mode: "unknown" };
    }),
  ]);
  if (!Array.isArray(users) || !Array.isArray(teams))
    throw new Error("Сервер вернул неверный формат рабочего пространства.");
  const mode =
    runtime && typeof runtime === "object" && "ai_mode" in runtime
      ? runtime.ai_mode
      : "unknown";
  const aiMode = mode === "openai" || mode === "fallback" ? mode : "unknown";
  return { address, users, teams, aiMode };
}
export async function readWorkspace(
  address: string,
  user: ServerUser,
  taskId: number | undefined,
  signal: AbortSignal,
): Promise<RemoteWorkspace> {
  const api = createBackendClient(address, user.id, signal);
  const [tasks, teams, profile, achievements, task] = await Promise.all([
    api<ServerTask[]>(
      user.role === "business" ? "/tasks/mine" : "/tasks?limit=100",
    ),
    api<ServerTeam[]>("/teams"),
    api<ServerProfile>(`/users/${user.id}`),
    api<ServerAchievement[]>("/achievements"),
    taskId ? api<ServerTask>(`/tasks/${taskId}`) : Promise.resolve(null),
  ]);
  const owned = user.role === "business" && task?.owner_id === user.id;
  const [questions, proposals] = await Promise.all([
    owned
      ? api<ServerQuestion[]>(`/tasks/${task!.id}/questions`)
      : Promise.resolve([]),
    Promise.all(
      user.role === "business"
        ? (tasks ?? []).map((t) =>
            api<ServerProposal[]>(`/tasks/${t.id}/proposals`),
          )
        : (teams ?? [])
            .filter((t) => t.members?.some((m) => m.user_id === user.id))
            .map((t) => api<ServerProposal[]>(`/teams/${t.id}/proposals`)),
    ),
  ]);
  return {
    tasks: tasks ?? [],
    teams: teams ?? [],
    profile,
    achievements: achievements ?? [],
    task,
    questions: (questions ?? []).sort((a, b) => a.position - b.position),
    proposals: proposals.flatMap((p) => p ?? []),
  };
}
