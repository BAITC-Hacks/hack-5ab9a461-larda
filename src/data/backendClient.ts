export interface ServerUser {
  id: number;
  name: string;
  role: string;
  exp: number;
}
export interface ServerTeam {
  id: number;
  name: string;
  members: { user_id: number; role: string }[] | null;
}
export interface ServerCard {
  title: string;
  context: string;
  need: string;
  target_users: string;
  available_data: string;
  expected_result: string;
  success_criteria: string;
  constraints: string;
  contact: string;
  interaction_format: string;
  feedback_process: string;
}
export interface ServerTask extends ServerCard {
  id: number;
  owner_id: number;
  raw_description: string;
  revision: number;
  evaluated_revision: number | null;
  ai_status: string;
  ai_error: string;
  draft_card: ServerCard | null;
  draft_evaluation: { score: number; source: string } | null;
  readiness_score: number;
  publication_status: string;
  execution_status: string;
  confirmed_at: string | null;
  score_breakdown?: { source: string };
  industry?: string;
  topic?: string;
}
export interface ServerQuestion {
  id: number;
  question: string;
  position: number;
  answer?: string | null;
}
export interface ServerMilestone {
  id: number;
  title: string;
  description: string;
  status: string;
  approved_at: string | null;
  result_url: string | null;
  exp_reward: number;
}
export interface ServerProposal {
  id: number;
  task_id: number;
  team_id: number;
  solution_idea: string;
  plan: string;
  duration_days: number;
  status: string;
  execution_status: string;
  milestones: ServerMilestone[] | null;
}
export interface ServerProfile {
  user: ServerUser;
  tags?: { id: number; name: string }[] | null;
  achievements?: { achievement_id: number; unlocked_at: string }[] | null;
  exp_history:
    | { id: number; amount: number; reason: string; task_id?: number | null }[]
    | null;
}
export class BackendError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export function createBackendClient(
  root: string,
  userId?: number,
  signal?: AbortSignal,
) {
  const url = new URL(root);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw new Error(
      "Укажите HTTP(S) URL сервера без пароля, query и fragment.",
    );
  const base = url.href.replace(/\/$/, "").replace(/\/api\/v1$/, "");
  return async <T>(
    path: string,
    method = "GET",
    json?: unknown,
  ): Promise<T> => {
    let response: Response;
    try {
      response = await fetch(`${base}/api/v1${path}`, {
        method,
        signal: signal
          ? AbortSignal.any([signal, AbortSignal.timeout(20000)])
          : AbortSignal.timeout(20000),
        headers: {
          ...(userId === undefined ? {} : { "X-Demo-User-ID": String(userId) }),
          ...(json === undefined ? {} : { "Content-Type": "application/json" }),
        },
        body: json === undefined ? undefined : JSON.stringify(json),
      });
    } catch (error) {
      if (signal?.aborted) throw error;
      throw new Error(
        "Сервер не ответил. Проверьте адрес, HTTPS и CORS. После отправки сначала обновите данные: операция могла сохраниться.",
      );
    }
    if (!response.ok) {
      const body = await response.json().catch(() => null);
      throw new BackendError(
        response.status,
        body?.error?.message ?? `Ошибка сервера HTTP ${response.status}`,
      );
    }
    return response.status === 204 ? (undefined as T) : response.json();
  };
}

export interface ServerAchievement {
  id: number;
  title: string;
  description: string;
  role_scope: string;
  exp_reward: number;
  is_active: boolean;
}
