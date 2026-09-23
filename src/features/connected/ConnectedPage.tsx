import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams, useLocation } from "react-router-dom";
import { Button, ErrorMessage, useAction } from "../../shared/ui/controls";
import { ServerOverview } from "./ServerOverview";
import {
  createBackendClient,
  type ServerUser,
  type ServerTeam,
  type ServerTask,
  type ServerQuestion,
  type ServerProposal,
  type ServerProfile,
  type ServerCard,
  type ServerAchievement,
} from "../../data/backendClient";

export function ConnectedPage({
  integrated = false,
}: {
  integrated?: boolean;
}) {
  const defaultAddress =
    import.meta.env.VITE_API_BASE_URL || window.location.origin;
  const [address, setAddress] = useState(
    integrated ? defaultAddress : "http://localhost:8080",
  );
  const [loading, setLoading] = useState(integrated);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [connection, setConnection] = useState<{
    address: string;
    users: ServerUser[];
    teams: ServerTeam[];
  } | null>(null);
  const action = useAction();
  useEffect(() => {
    if (!integrated) return;
    const controller = new AbortController();
    const api = createBackendClient(
      defaultAddress,
      undefined,
      controller.signal,
    );
    void Promise.all([api<ServerUser[]>("/users"), api<ServerTeam[]>("/teams")])
      .then(([users, teams]) => {
        if (!controller.signal.aborted) {
          setConnection({
            address: defaultAddress,
            users: users ?? [],
            teams: teams ?? [],
          });
          setLoading(false);
        }
      })
      .catch((error) => {
        if (!controller.signal.aborted) {
          setConnectionError(error.message);
          setLoading(false);
        }
      });
    return () => controller.abort();
  }, [integrated, defaultAddress]);
  return (
    <div className="app-theme">
      <header className="site-header">
        <div className="header-inner">
          <Link className="brand" to="/">
            Larda
          </Link>
          <span>Бизнес и студенческие команды · общий рабочий кабинет</span>
        </div>
      </header>
      <main className="container">
        {loading ? (
          <section className="panel" role="status">
            <h1>Загружаем рабочее пространство…</h1>
            <p>Получаем задачи и профили с сервера.</p>
          </section>
        ) : !connection ? (
          <section className="panel">
            <h1>
              {integrated
                ? "Сервер временно недоступен"
                : "Подключение к backend"}
            </h1>
            <ErrorMessage message={connectionError} />
            <p>
              Задачи, заявки и результаты будут сохраняться на сервере. AI
              выполняется на стороне backend в выбранном там режиме.
            </p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void action.run(async () => {
                  const api = createBackendClient(address);
                  const [users, teams] = await Promise.all([
                    api<ServerUser[]>("/users"),
                    api<ServerTeam[]>("/teams"),
                  ]);
                  if (!Array.isArray(users) || !Array.isArray(teams))
                    throw new Error(
                      "Сервер вернул неверный формат пользователей или команд.",
                    );
                  setConnection({ address, users, teams });
                });
              }}
            >
              <label className="field">
                Адрес backend
                <input
                  type="url"
                  required
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                />
              </label>
              <Button disabled={action.busy}>Подключиться</Button>
            </form>
            <ErrorMessage message={action.error} />
            <p className="field-help">
              Укажите корневой адрес, например http://localhost:8080. Это
              подключение не переносит локальные демо-данные.
            </p>
          </section>
        ) : (
          <ServerWorkspace
            connection={connection}
            onDisconnect={() => setConnection(null)}
          />
        )}
      </main>
    </div>
  );
}

function ServerWorkspace({
  connection,
  onDisconnect,
}: {
  connection: { address: string; users: ServerUser[]; teams: ServerTeam[] };
  onDisconnect: () => void;
}) {
  const [params, setParams] = useSearchParams();
  const { pathname } = useLocation();
  const preferred =
    pathname.startsWith("/student") || pathname.startsWith("/catalog")
      ? "student"
      : "business";
  const requestedUser = Number(params.get("user"));
  const userId =
    connection.users.find((u) => u.id === requestedUser)?.id ??
    connection.users.find((u) => u.role === preferred)?.id ??
    connection.users[0]?.id ??
    0;
  const taskId =
    Number(
      params.has("task")
        ? params.get("task")
        : pathname.match(/(?:catalog|tasks)\/(\d+)/)?.[1],
    ) || undefined;
  const selectTask = (id?: number) => {
    const next = new URLSearchParams(params);
    next.set("user", String(userId));
    if (id) next.set("task", String(id));
    else next.set("task", "");
    setParams(next);
  };
  const user = connection.users.find((u) => u.id === userId);
  // Remounting partitions private data and cancels pending requests on persona change.
  return (
    <>
      {user && (
        <nav className="main-nav" aria-label="Основная навигация">
          <Link to={`?user=${userId}&task=#overview`}>Рабочий стол</Link>
          <Link to={`?user=${userId}&task=#catalog`}>
            {user.role === "student" ? "Каталог задач" : "Мои задачи"}
          </Link>
        </nav>
      )}
      <div className="catalog-toolbar">
        <label>
          Профиль
          <select
            aria-label="Профиль"
            value={userId}
            onChange={(e) => setParams({ user: e.target.value, task: "" })}
          >
            {connection.users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name} · {u.role === "business" ? "Бизнес" : "Студент"}
              </option>
            ))}
          </select>
        </label>
        <Button variant="quiet" onClick={onDisconnect}>
          Отключиться
        </Button>
        <span className="field-help">Общая база · выбор демопрофиля</span>
      </div>
      {user ? (
        <PersonaWorkspace
          key={userId}
          address={connection.address}
          user={user}
          teams={connection.teams}
          selectedTaskId={taskId}
          selectTask={selectTask}
        />
      ) : (
        <p>
          На сервере нет пользователей. Попросите backend загрузить
          демо-аккаунты.
        </p>
      )}
    </>
  );
}

const statusText = (status: string) =>
  (
    ({
      not_started: "Не начато",
      in_progress: "В работе",
      completed: "Завершено",
      cancelled: "Отменено",
      pending: "На рассмотрении",
      accepted: "Принято",
      rejected: "Отклонено",
      submitted: "На проверке",
      succeeded: "Готово",
      failed: "Ошибка",
      running: "Обработка",
      team_task_completed: "Завершение проекта команды",
      milestone_completed: "Принят результат этапа",
      achievement_unlocked: "Открыто достижение",
      business_task_completed: "Принят итог проекта",
      task_published: "Публикация задачи",
    }) as Record<string, string>
  )[status] ?? status;

const cardLabels: Record<keyof ServerCard, string> = {
  title: "Название",
  context: "Контекст",
  need: "Потребность",
  target_users: "Целевые пользователи",
  available_data: "Данные",
  expected_result: "Ожидаемый результат",
  success_criteria: "Критерии успеха",
  constraints: "Ограничения",
  contact: "Контакт",
  interaction_format: "Формат взаимодействия",
  feedback_process: "Обратная связь",
};

function PersonaWorkspace({
  address,
  user,
  teams: initialTeams,
  selectedTaskId,
  selectTask,
}: {
  selectedTaskId?: number;
  selectTask: (id?: number) => void;
  address: string;
  user: ServerUser;
  teams: ServerTeam[];
}) {
  const { hash } = useLocation();
  const [teams, setTeams] = useState(initialTeams);
  const controller = useRef(new AbortController());
  const api = <T,>(path: string, method = "GET", body?: unknown) =>
    createBackendClient(address, user.id, controller.current.signal)<T>(
      path,
      method,
      body,
    );
  const action = useAction();
  const [search, setSearch] = useState("");
  const [availableOnly, setAvailableOnly] = useState(false);
  const [achievements, setAchievements] = useState<ServerAchievement[]>([]);
  const [fetching, setFetching] = useState(true);
  useEffect(() => {
    if (!fetching && ["#catalog", "#overview"].includes(hash))
      document.getElementById(hash.slice(1))?.scrollIntoView();
  }, [hash, fetching]);
  const [tasks, setTasks] = useState<ServerTask[]>([]);
  const [task, setTask] = useState<ServerTask | null>(null);
  const [questions, setQuestions] = useState<ServerQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [proposals, setProposals] = useState<ServerProposal[]>([]);
  const [profile, setProfile] = useState<ServerProfile | null>(null);
  const [description, setDescription] = useState("");
  const [confirmedRevision, setConfirmedRevision] = useState<string | null>(
    null,
  );
  const confirmationKey = task ? `${task.id}:${task.revision}` : null;
  const confirmed =
    confirmationKey !== null && confirmedRevision === confirmationKey;
  const setConfirmed = (value: boolean) =>
    setConfirmedRevision(value ? confirmationKey : null);
  const [waiting, setWaiting] = useState(false);
  const [pollExpired, setPollExpired] = useState(false);
  const owner = task?.owner_id === user.id && user.role === "business";
  const myTeams = teams.filter((t) =>
    t.members?.some((m) => m.user_id === user.id),
  );
  const captains = myTeams.filter((t) =>
    t.members?.some((m) => m.user_id === user.id && m.role === "captain"),
  );
  const loadSequence = useRef(0);
  async function refresh(selectedId = selectedTaskId) {
    const sequence = ++loadSequence.current;
    const freshTeams = await api<ServerTeam[]>("/teams");
    const memberTeams = (freshTeams ?? []).filter((t) =>
      t.members?.some((m) => m.user_id === user.id),
    );
    const [listed, p, awards] = await Promise.all([
      api<ServerTask[]>(
        user.role === "business" ? "/tasks/mine" : "/tasks?limit=100",
      ),
      api<ServerProfile>(`/users/${user.id}`),
      api<ServerAchievement[]>("/achievements"),
    ]);
    const selected = selectedId
      ? await api<ServerTask>(`/tasks/${selectedId}`)
      : null;
    const owned = selected?.owner_id === user.id && user.role === "business";
    const [q, lists] = await Promise.all([
      owned
        ? api<ServerQuestion[]>(`/tasks/${selected!.id}/questions`)
        : Promise.resolve([]),
      user.role === "business"
        ? Promise.all(
            (owned ? [selected!] : (listed ?? [])).map((item) =>
              api<ServerProposal[]>(`/tasks/${item.id}/proposals`),
            ),
          )
        : Promise.all(
            memberTeams.map((t) =>
              api<ServerProposal[]>(`/teams/${t.id}/proposals`),
            ),
          ),
    ]);
    if (controller.current.signal.aborted || sequence !== loadSequence.current)
      return;
    setTeams(freshTeams ?? []);
    setTasks(listed ?? []);
    setProfile(p);
    setAchievements(awards ?? []);
    setTask(selected);
    setQuestions((q ?? []).sort((a, b) => a.position - b.position));
    setAnswers(
      Object.fromEntries(
        (q ?? []).map((question) => [question.id, question.answer ?? ""]),
      ),
    );
    setProposals(lists.flatMap((l) => l ?? []));
  }
  useEffect(() => {
    // Fresh controller is required for React StrictMode's setup/cleanup replay.
    controller.current = new AbortController();
    setTask(null);
    setFetching(true);
    let disposed = false;
    void refresh()
      .finally(() => {
        if (!disposed) setFetching(false);
      })
      .catch((error) => {
        if (!disposed)
          void action.run(async () => {
            throw error;
          });
      });
    return () => {
      disposed = true;
      controller.current.abort();
    };
  }, [selectedTaskId]);
  useEffect(() => {
    if (!task || !owner || !["pending", "running"].includes(task.ai_status)) {
      setWaiting(false);
      return;
    }
    let stopped = false;
    const polling = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const started = Date.now();
    const read = createBackendClient(
      address,
      user.id,
      AbortSignal.any([controller.current.signal, polling.signal]),
    );
    setWaiting(true);
    setPollExpired(false);
    const poll = async () => {
      try {
        const updated = await read<ServerTask>(`/tasks/${task.id}`);
        if (stopped) return;
        if (!["pending", "running"].includes(updated.ai_status)) {
          await action.run(() => refresh(updated.id));
          return;
        }
        if (Date.now() - started > 180000) {
          setWaiting(false);
          setPollExpired(true);
          return;
        }
        timer = setTimeout(poll, 2000);
      } catch (error) {
        if (!stopped) {
          setWaiting(false);
          void action.run(async () => {
            throw error;
          });
        }
      }
    };
    timer = setTimeout(poll, 1000);
    return () => {
      stopped = true;
      clearTimeout(timer);
      polling.abort();
    };
  }, [task?.id, task?.revision, task?.ai_status]);
  const mutate = (path: string, body?: unknown) =>
    action.run(async () => {
      await api(path, "POST", body);
      await refresh();
      action.confirm("Изменения сохранены в общей базе");
    });
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="overline">
            {user.role === "business"
              ? "Управление задачами"
              : "Задачи и мои заявки"}
          </p>
          <h1>{user.name}</h1>
          <p>Опыт по данным сервера: {profile?.user.exp ?? user.exp ?? 0} XP</p>
        </div>
        <Button
          disabled={action.busy || waiting || fetching}
          onClick={() => action.run(() => refresh())}
        >
          Обновить данные
        </Button>
      </div>
      <ErrorMessage message={action.error} />
      {action.message && (
        <p role="status" className="status status--success">
          {action.message}
        </p>
      )}
      {fetching && <p role="status">Загружаем данные…</p>}
      <p className="field-help">
        Выберите задачу и команду. После принятия заявки начинается работа; опыт
        за принятый этап делится между участниками команды. Данные сохраняются в
        общей базе.
      </p>
      {!task && !fetching && (
        <ServerOverview
          user={user}
          profile={profile}
          tasks={tasks}
          proposals={proposals}
          achievements={achievements}
          onOpen={selectTask}
        />
      )}
      {user.role === "business" && !task && !fetching && (
        <section className="panel">
          <h2>Создать задачу с AI</h2>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void action.run(async () => {
                const created = await api<ServerTask>("/tasks", "POST", {
                  raw_description: description,
                });
                setDescription("");
                selectTask(created.id);
              });
            }}
          >
            <label className="field">
              Описание бизнес-проблемы
              <textarea
                required
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </label>
            <Button disabled={action.busy}>Создать и запустить анализ</Button>
          </form>
        </section>
      )}
      {!task ? (
        <>
          <h2 id="catalog">
            {user.role === "business" ? "Мои задачи" : "Каталог задач"}
          </h2>
          <div className="catalog-toolbar">
            <label className="field">
              Поиск задач
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Название или бизнес-проблема"
              />
            </label>
            {user.role === "student" && (
              <label>
                <input
                  type="checkbox"
                  checked={availableOnly}
                  onChange={(e) => setAvailableOnly(e.target.checked)}
                />{" "}
                Принимают заявки
              </label>
            )}
          </div>
          <div className="catalog-grid">
            {tasks
              .filter(
                (t) =>
                  (!search ||
                    `${t.title} ${t.context}`
                      .toLowerCase()
                      .includes(search.toLowerCase())) &&
                  (!availableOnly ||
                    !["completed", "cancelled"].includes(t.execution_status)),
              )
              .map((t) => (
                <article className="panel" key={t.id}>
                  <h3>{t.title || t.raw_description || `Задача №${t.id}`}</h3>
                  <p>{t.context}</p>
                  <p>
                    Готовность: {t.readiness_score}% ·{" "}
                    {t.publication_status === "published"
                      ? "Опубликована"
                      : "Черновик"}
                  </p>
                  <Button
                    disabled={action.busy}
                    onClick={() =>
                      action.run(async () => {
                        setConfirmed(false);
                        setAnswers({});
                        selectTask(t.id);
                      })
                    }
                  >
                    Открыть задачу №{t.id}
                  </Button>
                </article>
              ))}
          </div>
          {!tasks.length && <p>Задач пока нет.</p>}
          {user.role === "student" && (
            <section className="panel">
              <h2>Мои заявки</h2>
              {proposals.map((p) => (
                <p key={p.id}>
                  Заявка №{p.id} · {statusText(p.status)}{" "}
                  <Button
                    variant="quiet"
                    disabled={action.busy}
                    onClick={() =>
                      action.run(async () => selectTask(p.task_id))
                    }
                  >
                    Открыть задачу №{p.task_id}
                  </Button>
                </p>
              ))}
            </section>
          )}
        </>
      ) : (
        <>
          <Button
            variant="quiet"
            disabled={action.busy || waiting || fetching}
            onClick={() => {
              selectTask(undefined);
              setTask(null);
              setQuestions([]);
            }}
          >
            ← К списку задач
          </Button>
          <section className="panel">
            <h2>
              {task.title || task.draft_card?.title || `Задача №${task.id}`}
            </h2>
            <span className="status status--success">
              {task.publication_status === "published"
                ? "Опубликована"
                : "Черновик"}
            </span>
            <p>{task.context || task.raw_description}</p>
            {(task.draft_evaluation?.source || task.score_breakdown?.source) ===
              "fallback" && (
              <p className="inline-notice">
                Демо-помощник: проверяется заполненность полей. Внешняя модель
                не вызывается.
              </p>
            )}
            <p>
              Готовность: {task.readiness_score}% · Исполнение:{" "}
              {statusText(task.execution_status)}
            </p>
            {owner && (
              <>
                <p role="status">
                  AI:{" "}
                  {waiting
                    ? "Обрабатывает задачу…"
                    : statusText(task.ai_status)}
                  {task.draft_evaluation
                    ? ` · Источник: ${task.draft_evaluation.source} · Полнота черновика: ${task.draft_evaluation.score}%`
                    : ""}
                </p>
                {pollExpired && (
                  <p>
                    Ожидание завершено. Задача сохранена; обновите данные, чтобы
                    проверить результат.
                  </p>
                )}
                {task.ai_status === "failed" && (
                  <>
                    <ErrorMessage
                      message={task.ai_error || "AI не смог обработать задачу."}
                    />
                    <Button
                      disabled={action.busy}
                      onClick={() => mutate(`/tasks/${task.id}/ai/retry`)}
                    >
                      Повторить AI-анализ
                    </Button>
                  </>
                )}
                {!waiting &&
                  task.ai_status === "succeeded" &&
                  task.execution_status === "not_started" && (
                    <>
                      {questions.length > 0 && (
                        <details
                          open={!questions.every((q) => q.answer?.trim())}
                        >
                          <summary>Ответы на уточнения</summary>
                          <form
                            onSubmit={(e) => {
                              e.preventDefault();
                              void mutate(`/tasks/${task.id}/answers`, {
                                revision: task.revision,
                                answers: questions.map((q) => ({
                                  question_id: q.id,
                                  answer: answers[q.id],
                                })),
                              });
                            }}
                          >
                            <h3>Уточнения AI</h3>
                            {questions.map((q) => (
                              <label className="field" key={q.id}>
                                {q.question}
                                <textarea
                                  required
                                  value={answers[q.id] ?? ""}
                                  onChange={(e) =>
                                    setAnswers({
                                      ...answers,
                                      [q.id]: e.target.value,
                                    })
                                  }
                                />
                              </label>
                            ))}
                            <Button disabled={action.busy}>
                              Отправить все ответы
                            </Button>
                          </form>
                        </details>
                      )}
                      <CardEditor
                        key={`${task.id}-${task.revision}-${!!task.draft_card}`}
                        card={task.draft_card ?? task}
                        busy={action.busy}
                        onSave={(changes) =>
                          action.run(async () => {
                            await api(`/tasks/${task.id}`, "PATCH", {
                              revision: task.revision,
                              ...changes,
                            });
                            await refresh();
                            setConfirmed(false);
                          })
                        }
                      />
                      {task.draft_card &&
                        task.draft_evaluation &&
                        task.evaluated_revision === task.revision && (
                          <>
                            <label>
                              <input
                                type="checkbox"
                                disabled={action.busy || waiting || fetching}
                                checked={confirmed}
                                onChange={(e) => setConfirmed(e.target.checked)}
                              />{" "}
                              Я проверил факты в карточке
                            </label>
                            <Button
                              disabled={
                                action.busy ||
                                !confirmed ||
                                !task.draft_card.title.trim()
                              }
                              onClick={() =>
                                mutate(`/tasks/${task.id}/confirm`, {
                                  revision: task.revision,
                                })
                              }
                            >
                              Подтвердить карточку
                            </Button>
                          </>
                        )}
                      {!task.draft_card &&
                        task.confirmed_at &&
                        task.publication_status === "draft" && (
                          <Button
                            disabled={action.busy}
                            onClick={() => mutate(`/tasks/${task.id}/publish`)}
                          >
                            Опубликовать задачу
                          </Button>
                        )}
                    </>
                  )}
              </>
            )}
            {!owner && (
              <dl className="brief">
                {(Object.keys(cardLabels) as (keyof ServerCard)[])
                  .filter((k) => k !== "title" && k !== "context")
                  .map((k) => (
                    <div key={k}>
                      <dt>{cardLabels[k]}</dt>
                      <dd>{task[k] || "Не указано"}</dd>
                    </div>
                  ))}
              </dl>
            )}
          </section>
          {user.role === "student" &&
            task.publication_status === "published" &&
            !["completed", "cancelled"].includes(task.execution_status) &&
            (captains.length ? (
              <ServerProposalForm
                teams={captains}
                busy={action.busy}
                submit={(body) => mutate(`/tasks/${task.id}/proposals`, body)}
              />
            ) : (
              <p className="inline-notice">
                Подать заявку может капитан команды. Выберите профиль капитана
                вверху страницы.
              </p>
            ))}
          <section>
            <h2>
              {owner ? "Заявки команд и результаты" : "Заявки моей команды"}
            </h2>
            {proposals
              .filter((p) => p.task_id === task.id)
              .map((p) => (
                <article className="panel" key={p.id}>
                  <h3>
                    {teams.find((t) => t.id === p.team_id)?.name ??
                      `Команда №${p.team_id}`}{" "}
                    · Заявка №{p.id}
                  </h3>
                  <p>{p.solution_idea}</p>
                  <p>{p.plan}</p>
                  <p>
                    Срок: {p.duration_days} дней · {statusText(p.status)} ·{" "}
                    {statusText(p.execution_status)}
                  </p>
                  {owner && p.status === "pending" && (
                    <>
                      <Button
                        disabled={action.busy}
                        onClick={() =>
                          mutate(`/proposals/${p.id}/decision`, {
                            status: "accepted",
                          })
                        }
                      >
                        Выбрать команду
                      </Button>
                      <Button
                        variant="secondary"
                        disabled={action.busy}
                        onClick={() =>
                          mutate(`/proposals/${p.id}/decision`, {
                            status: "rejected",
                          })
                        }
                      >
                        Отклонить заявку
                      </Button>
                    </>
                  )}
                  {p.status === "accepted" && (
                    <>
                      {(p.milestones ?? []).map((m) => (
                        <section className="panel" key={m.id}>
                          <h4>{m.title}</h4>
                          <p>{m.description}</p>
                          <p>
                            {m.status === "rejected"
                              ? "Нужна доработка"
                              : statusText(m.status)}{" "}
                            · {m.exp_reward} XP на команду
                          </p>
                          {m.result_url &&
                            /^https?:\/\//i.test(m.result_url) && (
                              <a
                                href={m.result_url}
                                target="_blank"
                                rel="noreferrer"
                              >
                                Открыть результат ↗
                              </a>
                            )}
                          {p.execution_status === "in_progress" && (
                            <>
                              {owner && !m.approved_at && (
                                <Button
                                  disabled={action.busy}
                                  onClick={() =>
                                    mutate(`/milestones/${m.id}/approve`)
                                  }
                                >
                                  Согласовать этап
                                </Button>
                              )}
                              {owner && m.status === "submitted" && (
                                <>
                                  <Button
                                    disabled={action.busy}
                                    onClick={() =>
                                      mutate(`/milestones/${m.id}/review`, {
                                        accepted: true,
                                      })
                                    }
                                  >
                                    Принять результат
                                  </Button>
                                  <Button
                                    variant="secondary"
                                    disabled={action.busy}
                                    onClick={() =>
                                      mutate(`/milestones/${m.id}/review`, {
                                        accepted: false,
                                      })
                                    }
                                  >
                                    Вернуть на доработку
                                  </Button>
                                </>
                              )}
                              {!owner &&
                                captains.some((t) => t.id === p.team_id) &&
                                m.approved_at &&
                                ["pending", "rejected"].includes(m.status) && (
                                  <form
                                    onSubmit={(e) => {
                                      e.preventDefault();
                                      const data = new FormData(
                                        e.currentTarget,
                                      );
                                      void mutate(
                                        `/milestones/${m.id}/submit`,
                                        { result_url: data.get("result_url") },
                                      );
                                    }}
                                  >
                                    <label className="field">
                                      Ссылка на результат
                                      <input
                                        name="result_url"
                                        type="url"
                                        pattern="https?://.+"
                                        required
                                      />
                                    </label>
                                    <Button disabled={action.busy}>
                                      Отправить результат
                                    </Button>
                                  </form>
                                )}
                            </>
                          )}
                        </section>
                      ))}
                      {owner && p.execution_status === "in_progress" && (
                        <>
                          <MilestoneForm
                            busy={action.busy}
                            submit={(body) =>
                              mutate(`/proposals/${p.id}/milestones`, body)
                            }
                          />
                          <Button
                            disabled={
                              action.busy ||
                              !(p.milestones ?? []).some(
                                (m) => !!m.approved_at,
                              ) ||
                              (p.milestones ?? []).some(
                                (m) =>
                                  m.approved_at && m.status !== "completed",
                              )
                            }
                            onClick={() =>
                              mutate(`/proposals/${p.id}/complete`)
                            }
                          >
                            Завершить работу команды
                          </Button>
                        </>
                      )}
                    </>
                  )}
                </article>
              ))}
          </section>
          {owner && task.execution_status === "in_progress" && (
            <Button
              disabled={
                action.busy ||
                !proposals.some((p) => p.execution_status === "completed") ||
                proposals.some(
                  (p) =>
                    p.status === "accepted" &&
                    !["completed", "cancelled"].includes(p.execution_status),
                )
              }
              onClick={() => mutate(`/tasks/${task.id}/complete`)}
            >
              Подтвердить завершение всей задачи
            </Button>
          )}
        </>
      )}
      {profile?.exp_history?.length ? (
        <section className="panel">
          <h2>История опыта с сервера</h2>
          {profile.exp_history.map((e) => (
            <p key={e.id}>
              {e.amount > 0 ? "+" : ""}
              {e.amount} XP · {statusText(e.reason)}
            </p>
          ))}
        </section>
      ) : null}
    </>
  );
}

function CardEditor({
  card,
  busy,
  onSave,
}: {
  card: ServerCard;
  busy: boolean;
  onSave: (changes: Partial<ServerCard>) => void;
}) {
  const [draft, setDraft] = useState(card);
  const keys = Object.keys(cardLabels) as (keyof ServerCard)[];
  const changes = Object.fromEntries(
    keys
      .filter((k) => (draft[k] ?? "") !== (card[k] ?? ""))
      .map((k) => [k, draft[k]]),
  );
  return (
    <details>
      <summary>Проверить и отредактировать карточку</summary>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSave(changes);
        }}
      >
        {keys.map((k) => (
          <label className="field" key={k}>
            {cardLabels[k]}
            <textarea
              required={k === "title"}
              value={draft[k] ?? ""}
              onChange={(e) => setDraft({ ...draft, [k]: e.target.value })}
            />
          </label>
        ))}
        <Button disabled={busy || !Object.keys(changes).length}>
          Сохранить правки и оценить
        </Button>
      </form>
    </details>
  );
}
function ServerProposalForm({
  teams,
  busy,
  submit,
}: {
  teams: ServerTeam[];
  busy: boolean;
  submit: (body: unknown) => Promise<void>;
}) {
  return (
    <section className="panel">
      <h2>Подать заявку</h2>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const d = new FormData(e.currentTarget);
          void submit({
            team_id: Number(d.get("team_id")),
            solution_idea: d.get("idea"),
            plan: d.get("plan"),
            duration_days: Number(d.get("days")),
            ...(d.get("url") ? { prototype_url: d.get("url") } : {}),
          });
        }}
      >
        <label className="field">
          Команда
          <select name="team_id">
            {teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Идея решения
          <textarea name="idea" required />
        </label>
        <label className="field">
          План работы
          <textarea name="plan" required />
        </label>
        <label className="field">
          Срок в днях
          <input
            name="days"
            type="number"
            min="1"
            step="1"
            defaultValue="7"
            required
          />
        </label>
        <label className="field">
          Прототип (необязательно)
          <input name="url" type="url" pattern="https?://.+" />
        </label>
        <Button disabled={busy}>Отправить заявку</Button>
      </form>
    </section>
  );
}
function MilestoneForm({
  busy,
  submit,
}: {
  busy: boolean;
  submit: (body: unknown) => void;
}) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const d = new FormData(e.currentTarget);
        submit({
          title: d.get("title"),
          description: d.get("description"),
          exp_reward: Number(d.get("xp")),
        });
      }}
    >
      <h4>Добавить согласованный этап</h4>
      <label className="field">
        Название этапа
        <input name="title" required />
      </label>
      <label className="field">
        Критерии результата
        <textarea name="description" required />
      </label>
      <label className="field">
        XP на команду
        <input
          name="xp"
          type="number"
          min="0"
          step="1"
          defaultValue="200"
          required
        />
      </label>
      <Button disabled={busy}>Добавить этап</Button>
    </form>
  );
}
