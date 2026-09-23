import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import { Button, ErrorMessage } from "../../shared/ui/controls";
import { AnimatedProgress } from "../../shared/motion/AnimatedProgress";
import { levelAt } from "../../domain/progression";
import {
  connectWorkspace,
  type RemoteWorkspace,
} from "../../data/serverWorkspace";
import type { ServerTask, ServerUser } from "../../data/backendClient";
import { useRemoteWorkspace } from "./useRemoteWorkspace";
import { TaskWizard } from "./TaskWizard";
import { ProposalWizard } from "./ProposalWizard";
import { DeliveryPanel } from "./DeliveryPanel";
import "./workspace.css";

type Connection = Awaited<ReturnType<typeof connectWorkspace>>;
type View =
  "home" | "catalog" | "projects" | "profile" | "new" | "edit" | "task";
const status = (value: string) =>
  ({
    pending: "На рассмотрении",
    accepted: "Команда выбрана",
    rejected: "Отклонено",
    in_progress: "В работе",
    completed: "Завершено",
    not_started: "Набор команд",
    cancelled: "Отменено",
    submitted: "На проверке",
    draft: "Черновик",
    published: "Опубликована",
  })[value] ?? value;
const topicName = (topic: string) =>
  ({
    retail: "Торговля",
    analytics: "Аналитика",
    marketplace: "Маркетплейс",
    education: "Образование",
    logistics: "Логистика",
  })[topic] ?? topic;
const titleOf = (task: ServerTask) =>
  task.title || task.draft_card?.title || `Задача №${task.id}`;

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
  const [connection, setConnection] = useState<Connection | null>(null);
  const [loading, setLoading] = useState(integrated);
  const [error, setError] = useState<string | null>(null);
  const controller = useRef<AbortController | null>(null);
  async function connect(target: string) {
    controller.current?.abort();
    const current = new AbortController();
    controller.current = current;
    setLoading(true);
    setError(null);
    try {
      const next = await connectWorkspace(target, current.signal);
      if (!current.signal.aborted) setConnection(next);
    } catch (cause) {
      if (!current.signal.aborted)
        setError(
          cause instanceof Error ? cause.message : "Не удалось подключиться.",
        );
    } finally {
      if (!current.signal.aborted) setLoading(false);
    }
  }
  useEffect(() => {
    if (integrated) void connect(defaultAddress);
    return () => controller.current?.abort();
  }, [integrated, defaultAddress]);
  return (
    <div className="app-theme workspace-app">
      {connection ? (
        <Workspace connection={connection} />
      ) : (
        <main className="workspace-content">
          <Link className="workspace-brand" to="/">
            Larda
          </Link>
          <section className="workspace-card workspace-section">
            <h1>
              {loading
                ? "Подключаем рабочее пространство…"
                : integrated
                  ? "Сервер временно недоступен"
                  : "Подключение к backend"}
            </h1>
            <ErrorMessage message={error} />
            {!loading && (
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  void connect(address);
                }}
              >
                <p className="workspace-summary">
                  Задачи и результаты сохраняются в общей базе. Подключитесь,
                  чтобы продолжить.
                </p>
                <label className="field">
                  Адрес backend
                  <input
                    type="url"
                    required
                    value={address}
                    onChange={(event) => setAddress(event.target.value)}
                  />
                </label>
                <Button>Подключиться</Button>
              </form>
            )}
          </section>
        </main>
      )}
    </div>
  );
}

function Workspace({ connection }: { connection: Connection }) {
  const [params, setParams] = useSearchParams();
  const { pathname } = useLocation();
  const preferred =
    pathname.startsWith("/student") || pathname.startsWith("/catalog")
      ? "student"
      : "business";
  const user =
    connection.users.find(
      (candidate) => candidate.id === Number(params.get("user")),
    ) ??
    connection.users.find((candidate) => candidate.role === preferred) ??
    connection.users[0];
  const taskId =
    Number(
      params.has("task")
        ? params.get("task")
        : pathname.match(/(?:catalog|tasks)\/(\d+)/)?.[1],
    ) || undefined;
  if (!user)
    return (
      <main className="workspace-content">
        <h1>Нет доступных профилей</h1>
        <p>Загрузите демо-пользователей на сервере.</p>
      </main>
    );
  const student = user.role === "student";
  const requested = params.get("view");
  const view: View = (
    ["home", "catalog", "projects", "profile", "new", "edit", "task"].includes(
      requested ?? "",
    )
      ? requested
      : taskId
        ? "task"
        : student
          ? "catalog"
          : "home"
  ) as View;
  const nav: [View, string][] = student
    ? [
        ["catalog", "Каталог задач"],
        ["projects", "Мои проекты"],
        ["profile", "Мой прогресс"],
      ]
    : [
        ["home", "Рабочий стол"],
        ["catalog", "Мои задачи"],
        ["projects", "Отклики и проекты"],
      ];
  const go = (next: View, id?: number) =>
    setParams({
      user: String(user.id),
      view: next,
      task: id ? String(id) : "",
    });
  return (
    <div className="workspace-layout">
      <aside className="workspace-sidebar">
        <Link
          className="workspace-brand"
          to={`?user=${user.id}&view=${student ? "catalog" : "home"}&task=`}
        >
          <span aria-hidden="true">L</span>Larda
        </Link>
        <nav className="workspace-nav" aria-label="Основная навигация">
          {nav.map(([next, label], index) => (
            <Link
              key={next}
              className="workspace-nav-item"
              aria-current={
                view === next ||
                (next === "catalog" && ["task", "edit", "new"].includes(view))
                  ? "page"
                  : undefined
              }
              to={`?user=${user.id}&view=${next}&task=`}
            >
              <NavIcon index={index} />
              {label}
            </Link>
          ))}
        </nav>
        <div className="workspace-sidebar-footer">
          <strong>
            Реальные задачи.
            <br />
            Проверяемый результат.
          </strong>
          <span>Задача → Команда → Результат</span>
          <span>
            Демонстрационный доступ.
            <br />
            Профили без авторизации.
          </span>
        </div>
      </aside>
      <div className="workspace-main">
        <header className="workspace-topbar">
          <span className="workspace-status">
            {student ? "Студенческое пространство" : "Кабинет бизнеса"}
          </span>
          <div className="workspace-persona">
            <label>
              Профиль · демо-доступ
              <select
                aria-label="Профиль"
                value={user.id}
                onChange={(event) => {
                  const next = connection.users.find(
                    (candidate) => candidate.id === Number(event.target.value),
                  )!;
                  setParams({
                    user: event.target.value,
                    view: next.role === "student" ? "catalog" : "home",
                    task: "",
                  });
                }}
              >
                {connection.users.map((candidate) => (
                  <option key={candidate.id} value={candidate.id}>
                    {candidate.name} ·{" "}
                    {candidate.role === "business" ? "Бизнес" : "Студент"}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </header>
        <Persona
          key={`${connection.address}:${user.id}`}
          address={connection.address}
          aiMode={connection.aiMode}
          user={user}
          taskId={taskId}
          view={view}
          go={go}
        />
      </div>
    </div>
  );
}

function NavIcon({ index }: { index: number }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      aria-hidden="true"
    >
      {index === 0 ? (
        <>
          <rect x="3" y="3" width="7" height="7" rx="1.5" />
          <rect x="14" y="3" width="7" height="7" rx="1.5" />
          <rect x="3" y="14" width="7" height="7" rx="1.5" />
          <rect x="14" y="14" width="7" height="7" rx="1.5" />
        </>
      ) : index === 1 ? (
        <>
          <rect x="3" y="7" width="18" height="14" rx="2" />
          <path d="M8 7V3h8v4M3 12h18M10 12v3h4v-3" />
        </>
      ) : (
        <>
          <path d="m12 3 8 5v8l-8 5-8-5V8Z" />
          <path d="m8 12 3 3 5-6" />
        </>
      )}
    </svg>
  );
}

function Persona({
  address,
  aiMode,
  user,
  taskId,
  view,
  go,
}: {
  address: string;
  aiMode: string;
  user: ServerUser;
  taskId?: number;
  view: View;
  go: (view: View, id?: number) => void;
}) {
  const remote = useRemoteWorkspace(address, user, taskId, view);
  const { data, loading, busy, error, waiting, pollExpired, request } = remote;
  const main = useRef<HTMLElement>(null);
  const student = user.role === "student";
  const task = data.task?.id === taskId ? data.task : null;
  const open = (id: number) => go("task", id);
  useEffect(() => {
    main.current?.focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [view, taskId]);
  const wizard =
    !student &&
    (view === "new" ||
      (!!task &&
        task.owner_id === user.id &&
        task.execution_status === "not_started" &&
        (view === "edit" || task.publication_status === "draft")));
  const save = async (path: string, body?: unknown, method = "POST") => {
    await request(path, method, body);
  };
  return (
    <main className="workspace-content" ref={main} tabIndex={-1}>
      {error && (
        <div className="workspace-section">
          <ErrorMessage message={error} />
          <Button variant="quiet" onClick={remote.reload}>
            Обновить данные
          </Button>
        </div>
      )}
      {pollExpired && (
        <p role="status" className="inline-notice">
          Обработка занимает больше времени. Задача сохранена.{" "}
          <Button variant="quiet" onClick={remote.reload}>
            Проверить результат
          </Button>
        </p>
      )}
      {loading ? (
        <p role="status">Загружаем данные…</p>
      ) : wizard ? (
        <>
          <Heading
            title={task ? "Подготовка задачи" : "Новая задача"}
            description={
              aiMode === "openai"
                ? "ИИ поможет уточнить задачу. Вы проверяете факты и решаете, когда её публиковать."
                : aiMode === "fallback"
                  ? "Включён демо-помощник: проверяется заполненность, внешняя модель не вызывается."
                  : "Помощник уточнит задачу. Источник оценки будет указан в готовой карточке."
            }
          />
          <TaskWizard
            key={task?.id ?? "new"}
            task={task}
            questions={data.questions}
            busy={busy}
            waiting={waiting}
            onBack={() => go("catalog")}
            onCreate={async (description) => {
              const created = await request<ServerTask>("/tasks", "POST", {
                raw_description: description,
              });
              go("edit", created.id);
            }}
            onAnswers={(answers) =>
              save(`/tasks/${task!.id}/answers`, {
                revision: task!.revision,
                answers,
              })
            }
            onSave={(changes) =>
              save(
                `/tasks/${task!.id}`,
                { revision: task!.revision, ...changes },
                "PATCH",
              )
            }
            onConfirm={() =>
              save(`/tasks/${task!.id}/confirm`, { revision: task!.revision })
            }
            onPublish={() => save(`/tasks/${task!.id}/publish`)}
            onRetry={() => save(`/tasks/${task!.id}/ai/retry`)}
          />
        </>
      ) : taskId ? (
        task ? (
          <TaskDetail
            key={task.id}
            task={task}
            user={user}
            data={data}
            busy={busy}
            request={request}
            onBack={() => go("catalog")}
            onEdit={() => go("edit", task.id)}
          />
        ) : (
          <div className="workspace-empty">
            <h1>Задача недоступна</h1>
            <Button onClick={() => go("catalog")}>К списку задач</Button>
          </div>
        )
      ) : view === "profile" && student ? (
        <Profile user={user} data={data} open={open} />
      ) : view === "projects" ? (
        <Projects user={user} data={data} open={open} />
      ) : view === "home" && !student ? (
        <BusinessHome data={data} go={go} />
      ) : (
        <Catalog
          student={student}
          tasks={data.tasks}
          open={open}
          create={() => go("new")}
        />
      )}
    </main>
  );
}

function Heading({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="workspace-heading">
      <div>
        <h1>{title}</h1>
        {description && <p className="workspace-summary">{description}</p>}
      </div>
      {action}
    </div>
  );
}
function TaskRow({
  task,
  open,
}: {
  task: ServerTask;
  open: (id: number) => void;
}) {
  return (
    <article className="workspace-task-row">
      <div className="workspace-task-copy">
        <div className="workspace-task-meta">
          <span className="status">
            {task.publication_status === "draft"
              ? "Черновик"
              : status(task.execution_status)}
          </span>
          <span>Готовность {task.readiness_score}%</span>
          {task.topic && <span>{topicName(task.topic)}</span>}
        </div>
        <h3>{titleOf(task)}</h3>
        <p className="workspace-clamp">
          {task.need || task.context || task.raw_description}
        </p>
      </div>
      <Button
        variant="secondary"
        aria-label={`Открыть задачу №${task.id}`}
        onClick={() => open(task.id)}
      >
        Открыть <span aria-hidden="true">↗</span>
      </Button>
    </article>
  );
}

function Catalog({
  student,
  tasks,
  open,
  create,
}: {
  student: boolean;
  tasks: ServerTask[];
  open: (id: number) => void;
  create: () => void;
}) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const filtered = tasks
    .filter(
      (task) =>
        (filter === "all" ||
          (filter === "ready" && task.readiness_score >= 70) ||
          (filter === "open" &&
            task.publication_status === "published" &&
            !["completed", "cancelled"].includes(task.execution_status)) ||
          (filter === "draft" && task.publication_status === "draft")) &&
        `${titleOf(task)} ${task.need} ${task.context}`
          .toLocaleLowerCase()
          .includes(search.toLocaleLowerCase()),
    )
    .sort((a, b) => b.readiness_score - a.readiness_score || b.id - a.id);
  return (
    <>
      <Heading
        title={student ? "Каталог задач" : "Мои задачи"}
        description={
          student
            ? "Найдите бизнес-проблему, предложите решение и получите опыт реального проекта."
            : "От черновика до результата — все ваши задачи в одном месте."
        }
        action={!student && <Button onClick={create}>Создать задачу</Button>}
      />
      <div className="workspace-toolbar">
        <label className="field">
          Поиск
          <input
            type="search"
            placeholder="Название или проблема бизнеса"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
        <label className="field">
          Показать
          <select
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
          >
            <option value="all">Все задачи</option>
            <option value="open">Принимают заявки</option>
            <option value="ready">Готовность от 70%</option>
            {!student && <option value="draft">Черновики</option>}
          </select>
        </label>
      </div>
      {filtered.length ? (
        <div className="workspace-list">
          {filtered.map((task) => (
            <TaskRow key={task.id} task={task} open={open} />
          ))}
        </div>
      ) : (
        <div className="workspace-empty">
          <h2>{tasks.length ? "Ничего не найдено" : "Задач пока нет"}</h2>
          <p>
            {tasks.length
              ? "Попробуйте другое слово или сбросьте фильтр."
              : student
                ? "Опубликованные бизнесом задачи появятся здесь."
                : "Начните с описания проблемы. Помощник подготовит уточняющие вопросы."}
          </p>
        </div>
      )}
    </>
  );
}

function BusinessHome({
  data,
  go,
}: {
  data: RemoteWorkspace;
  go: (view: View, id?: number) => void;
}) {
  const reviews = data.proposals.filter(
    (p) =>
      p.execution_status === "in_progress" &&
      p.milestones?.some((m) => m.status === "submitted"),
  );
  const pending = data.proposals.filter((p) => p.status === "pending");
  const queue = [...reviews, ...pending].slice(0, 4);
  const drafts = data.tasks.filter(
    (task) => task.publication_status === "draft",
  );
  return (
    <>
      <Heading
        title="Рабочий стол"
        description="Вы определяете задачу, выбираете команду и принимаете результат."
      />
      <section className="workspace-hero">
        <div>
          <p className="workspace-eyebrow">От идеи к решению</p>
          <h2>
            Дайте вашей задаче
            <br />
            сильную команду
          </h2>
          <p>
            Опишите проблему своими словами. Помощник уточнит детали, а студенты
            предложат план работы.
          </p>
          <Button onClick={() => go("new")}>
            Создать задачу <span aria-hidden="true">→</span>
          </Button>
        </div>
        <div className="workspace-hero-mark" aria-hidden="true">
          ↗
        </div>
      </section>
      <div className="workspace-statline">
        <span>
          <strong>{reviews.length}</strong> результатов на проверке
        </span>
        <span>
          <strong>{pending.length}</strong> новых заявок
        </span>
        <span>
          <strong>
            {
              data.proposals.filter((p) => p.execution_status === "completed")
                .length
            }
          </strong>{" "}
          работ завершено
        </span>
      </div>
      <section className="workspace-section">
        <div className="workspace-section-heading">
          <h2>Требует вашего решения</h2>
          <Button variant="quiet" onClick={() => go("projects")}>
            Все проекты →
          </Button>
        </div>
        {queue.length ? (
          <div className="workspace-list">
            {queue.map((proposal) => (
              <article key={proposal.id} className="workspace-task-row">
                <div className="workspace-task-copy">
                  <p className="workspace-eyebrow">
                    {reviews.includes(proposal)
                      ? "Результат на проверке"
                      : "Новая заявка"}{" "}
                    ·{" "}
                    {data.teams.find((team) => team.id === proposal.team_id)
                      ?.name ?? `Команда №${proposal.team_id}`}
                  </p>
                  <h3>
                    {data.tasks.find((task) => task.id === proposal.task_id)
                      ?.title ?? `Задача №${proposal.task_id}`}
                  </h3>
                  <p>
                    {reviews.includes(proposal)
                      ? "Проверьте результат и примите этап или верните на доработку."
                      : "Посмотрите идею и план команды."}
                  </p>
                </div>
                <Button
                  variant="secondary"
                  onClick={() => go("task", proposal.task_id)}
                >
                  Рассмотреть
                </Button>
              </article>
            ))}
          </div>
        ) : (
          <div className="workspace-empty">
            <h3>Всё под контролем</h3>
            <p>Новые заявки и результаты на проверке появятся здесь.</p>
          </div>
        )}
      </section>
      {drafts.length > 0 && (
        <section className="workspace-section">
          <div className="workspace-section-heading">
            <h2>Продолжить подготовку</h2>
            <span>{drafts.length} черновиков</span>
          </div>
          <div className="workspace-list">
            {drafts.slice(0, 2).map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                open={(id) => go("edit", id)}
              />
            ))}
          </div>
        </section>
      )}
    </>
  );
}

function Projects({
  user,
  data,
  open,
}: {
  user: ServerUser;
  data: RemoteWorkspace;
  open: (id: number) => void;
}) {
  const [filter, setFilter] = useState("all");
  const proposals = data.proposals.filter(
    (p) =>
      filter === "all" ||
      (filter === "pending" && p.status === "pending") ||
      p.execution_status === filter,
  );
  return (
    <>
      <Heading
        title={user.role === "student" ? "Мои проекты" : "Отклики и проекты"}
        description="Заявки, согласованные этапы и результаты команд."
      />
      <div className="workspace-toolbar">
        <label className="field">
          Статус
          <select
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
          >
            <option value="all">Все проекты</option>
            <option value="pending">На рассмотрении</option>
            <option value="in_progress">В работе</option>
            <option value="completed">Завершены</option>
          </select>
        </label>
      </div>
      {proposals.length ? (
        <div className="workspace-list">
          {proposals.map((p) => {
            const stages = (p.milestones ?? []).filter((m) => m.approved_at);
            return (
              <article className="workspace-task-row" key={p.id}>
                <div className="workspace-task-copy">
                  <div className="workspace-task-meta">
                    <span className="status">
                      {status(
                        p.status === "accepted" ? p.execution_status : p.status,
                      )}
                    </span>
                    <span>
                      {data.teams.find((t) => t.id === p.team_id)?.name} ·{" "}
                      {p.duration_days} дней
                    </span>
                  </div>
                  <h3>
                    {data.tasks.find((t) => t.id === p.task_id)?.title ||
                      `Задача №${p.task_id}`}
                  </h3>
                  <p className="workspace-clamp">{p.solution_idea}</p>
                  {stages.length > 0 && (
                    <div className="workspace-progress">
                      <AnimatedProgress
                        value={
                          stages.filter((m) => m.status === "completed").length
                        }
                        max={stages.length}
                        label="Принятые этапы"
                        compact
                      />
                    </div>
                  )}
                </div>
                <Button variant="secondary" onClick={() => open(p.task_id)}>
                  Открыть проект
                </Button>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="workspace-empty">
          <h2>Пока нет проектов</h2>
          <p>
            {user.role === "student"
              ? "Выберите задачу в каталоге и предложите решение от своей команды."
              : "После публикации задачи здесь появятся предложения команд."}
          </p>
        </div>
      )}
    </>
  );
}

function TaskDetail({
  task,
  user,
  data,
  busy,
  request,
  onBack,
  onEdit,
}: {
  task: ServerTask;
  user: ServerUser;
  data: RemoteWorkspace;
  busy: boolean;
  request: <T>(path: string, method?: string, body?: unknown) => Promise<T>;
  onBack: () => void;
  onEdit: () => void;
}) {
  const proposals = data.proposals.filter((p) => p.task_id === task.id);
  const [applying, setApplying] = useState(false);
  const [proposalStarted, setProposalStarted] = useState(false);
  const [tab, setTab] = useState(proposals.length ? "delivery" : "brief");
  const owner = task.owner_id === user.id;
  const student = user.role === "student";
  const captains = data.teams.filter((team) =>
    team.members?.some(
      (member) => member.user_id === user.id && member.role === "captain",
    ),
  );
  const canApply =
    student &&
    task.publication_status === "published" &&
    !["completed", "cancelled"].includes(task.execution_status);
  const details = [
    ["Проблема", task.need],
    ["Ожидаемый результат", task.expected_result],
    ["Критерии успеха", task.success_criteria],
    ["Данные", task.available_data],
  ];
  return (
    <>
      <div hidden={applying}>
        <Button className="workspace-back" variant="quiet" onClick={onBack}>
          ← К списку задач
        </Button>
        <Heading
          title={titleOf(task)}
          description={task.context || task.raw_description}
          action={
            canApply && captains.length > 0 ? (
              <Button
                onClick={() => {
                  setProposalStarted(true);
                  setApplying(true);
                }}
              >
                Подать заявку
              </Button>
            ) : owner && task.execution_status === "not_started" ? (
              <Button variant="secondary" onClick={onEdit}>
                Уточнить задачу
              </Button>
            ) : undefined
          }
        />
        <div className="workspace-task-meta">
          <span className="status">{status(task.execution_status)}</span>
          <span>Готовность {task.readiness_score}%</span>
          <span>
            {proposals.length} {owner ? "заявок" : "заявок ваших команд"}
          </span>
        </div>
        <div className="workspace-tabs" role="group" aria-label="Раздел задачи">
          <Button
            variant={tab === "brief" ? "secondary" : "quiet"}
            aria-pressed={tab === "brief"}
            onClick={() => setTab("brief")}
          >
            Описание
          </Button>
          <Button
            variant={tab === "delivery" ? "secondary" : "quiet"}
            aria-pressed={tab === "delivery"}
            onClick={() => setTab("delivery")}
          >
            {owner ? "Заявки и результаты" : "Моя команда"}
            {proposals.length ? ` · ${proposals.length}` : ""}
          </Button>
        </div>
        {canApply && !captains.length && (
          <p className="inline-notice">
            Подать заявку может капитан команды. Выберите профиль капитана
            вверху страницы.
          </p>
        )}
        {tab === "brief" ? (
          <div className="workspace-detail-grid">
            <section className="workspace-card">
              <dl className="brief">
                {details.map(([label, value]) => (
                  <div key={label}>
                    <dt>{label}</dt>
                    <dd>{value || "Нужно уточнить у бизнеса"}</dd>
                  </div>
                ))}
              </dl>
              <details>
                <summary>Участники и условия</summary>
                <dl className="brief brief--compact">
                  {[
                    ["Пользователи", task.target_users],
                    ["Ограничения", task.constraints],
                    ["Контакт", task.contact],
                    ["Взаимодействие", task.interaction_format],
                    ["Обратная связь", task.feedback_process],
                  ].map(([label, value]) => (
                    <div key={label}>
                      <dt>{label}</dt>
                      <dd>{value || "Не указано"}</dd>
                    </div>
                  ))}
                </dl>
              </details>
            </section>
            <aside className="workspace-card">
              <h2>Как это работает</h2>
              <ol className="workspace-timeline">
                <li>
                  <h3>Предложение</h3>
                  <p>Команда описывает идею и план.</p>
                </li>
                <li>
                  <h3>Совместная работа</h3>
                  <p>Бизнес выбирает команду и согласует этапы.</p>
                </li>
                <li className="is-verified">
                  <h3>Проверяемый результат</h3>
                  <p>Бизнес принимает работу. Команда получает опыт.</p>
                </li>
              </ol>
              {owner && task.score_breakdown?.source === "fallback" && (
                <p className="field-help workspace-section">
                  Эта версия оценена демо-помощником. Это источник сохранённой
                  оценки, а не текущая настройка ИИ.
                </p>
              )}
            </aside>
          </div>
        ) : (
          <DeliveryPanel
            task={task}
            user={user}
            teams={data.teams}
            proposals={proposals}
            busy={busy}
            request={request}
          />
        )}
      </div>
      {proposalStarted && canApply && captains.length > 0 && (
        <div hidden={!applying}>
          <ProposalWizard
            teams={captains}
            busy={busy}
            onBack={() => setApplying(false)}
            onSubmit={async (body) => {
              await request(`/tasks/${task.id}/proposals`, "POST", body);
              setTab("delivery");
            }}
          />
        </div>
      )}
    </>
  );
}

function Profile({
  user,
  data,
  open,
}: {
  user: ServerUser;
  data: RemoteWorkspace;
  open: (id: number) => void;
}) {
  const profile = data.profile;
  const xp = profile?.user.exp ?? user.exp ?? 0;
  const level = levelAt(xp);
  const completed = data.proposals.filter(
    (p) => p.execution_status === "completed",
  );
  const awards = data.achievements.filter(
    (a) => a.is_active && ["all", "student"].includes(a.role_scope),
  );
  const reasons: Record<string, string> = {
    team_task_completed: "Завершение проекта команды",
    milestone_completed: "Принят результат этапа",
    achievement_unlocked: "Открыто достижение",
  };
  return (
    <>
      <Heading
        title="Мой прогресс"
        description="Каждый принятый бизнесом результат становится частью вашего опыта."
      />
      <section className="workspace-hero">
        <div>
          <p className="workspace-eyebrow">{profile?.user.name ?? user.name}</p>
          <h2>Уровень {level}</h2>
          <p>Опыт по данным сервера: {xp} XP</p>
          <div className="workspace-progress">
            <AnimatedProgress
              value={xp - 50 * level * (level - 1)}
              max={100 * level}
              label="К следующему уровню"
            />
          </div>
          <p>{50 * (level + 1) * level - xp} XP до следующего уровня</p>
        </div>
        <div className="workspace-hero-mark" aria-hidden="true">
          {level}
        </div>
      </section>
      <section className="workspace-section">
        <div className="workspace-section-heading">
          <h2>Достижения</h2>
          <span>{profile?.achievements?.length ?? 0} открыто</span>
        </div>
        <div className="workspace-award-grid">
          {awards.map((a) => {
            const unlocked = profile?.achievements?.some(
              (u) => u.achievement_id === a.id,
            );
            return (
              <article className={unlocked ? "is-unlocked" : ""} key={a.id}>
                <span className="achievement-icon" aria-hidden="true">
                  ◇
                </span>
                <h3>{a.title}</h3>
                <p>{a.description}</p>
                <p>+{a.exp_reward} XP</p>
                <span className="status">
                  {unlocked
                    ? "Открыто · подтверждено сервером"
                    : "Ещё не открыто"}
                </span>
              </article>
            );
          })}
        </div>
        {!awards.length && (
          <p className="field-help">Достижения пока не настроены.</p>
        )}
      </section>
      <section className="workspace-section">
        <div className="workspace-section-heading">
          <h2>Навыки профиля</h2>
        </div>
        <div className="workspace-tags">
          {profile?.tags?.length ? (
            profile.tags.map((tag) => <span key={tag.name}>{tag.name}</span>)
          ) : (
            <p className="field-help">Навыки пока не указаны</p>
          )}
        </div>
        <p className="field-help">
          Навыки указаны в профиле. Принятые результаты вашей команды доступны в
          проектах ниже.
        </p>
      </section>
      <section className="workspace-section">
        <div className="workspace-section-heading">
          <h2>Завершённые проекты</h2>
          <span>{completed.length}</span>
        </div>
        {completed.length ? (
          <div className="workspace-list">
            {completed.map((p) => (
              <article key={p.id} className="workspace-task-row">
                <div className="workspace-task-copy">
                  <span className="workspace-status is-verified">
                    Работа команды принята бизнесом
                  </span>
                  <h3>
                    {data.tasks.find((t) => t.id === p.task_id)?.title ||
                      `Задача №${p.task_id}`}
                  </h3>
                  <p>{p.solution_idea}</p>
                  {(p.milestones ?? [])
                    .filter(
                      (m) =>
                        m.status === "completed" &&
                        /^https?:\/\//i.test(m.result_url ?? ""),
                    )
                    .map((m) => (
                      <p key={m.id}>
                        <a
                          href={m.result_url!}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {m.title} ↗
                        </a>
                      </p>
                    ))}
                </div>
                <Button variant="secondary" onClick={() => open(p.task_id)}>
                  Посмотреть подтверждение
                </Button>
              </article>
            ))}
          </div>
        ) : (
          <div className="workspace-empty">
            <p>
              Здесь появятся проекты, которые команда завершила и бизнес принял.
            </p>
          </div>
        )}
      </section>
      {!!profile?.exp_history?.length && (
        <details className="workspace-section">
          <summary>История опыта</summary>
          <ul className="workspace-timeline">
            {profile.exp_history.map((event) => (
              <li key={event.id}>
                <p>
                  <strong>
                    {event.amount > 0 ? "+" : ""}
                    {event.amount} XP
                  </strong>{" "}
                  · {reasons[event.reason] ?? event.reason}
                </p>
              </li>
            ))}
          </ul>
        </details>
      )}
    </>
  );
}
