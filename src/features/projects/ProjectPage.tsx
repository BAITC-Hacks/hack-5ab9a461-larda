import { useState } from "react";
import { useParams } from "react-router-dom";
import { useWorkspace } from "../../app/WorkspaceProvider";
import {
  BUSINESS_USER_ID,
  STUDENT_USER_ID,
  type Project,
  type StageInput,
  type Submission,
  type SubmissionInput,
  type ReviewInput,
  type Contribution,
} from "../../domain/models";
import { projectProgress, stages } from "../../domain/progression";
import {
  ActionLink,
  Button,
  EmptyState,
  ErrorMessage,
  PageTrail,
  useAction,
} from "../../shared/ui/controls";
import { AnimatedProgress } from "../../shared/motion/AnimatedProgress";
import { TaskBrief } from "../../shared/ui/TaskBrief";

export function ProjectPage({ business = false }: { business?: boolean }) {
  const { proposalId } = useParams();
  const { state, repository } = useWorkspace();
  const action = useAction();
  const proposal = state.proposals.find(
    (p) => p.id === proposalId && p.status === "accepted",
  );
  const task = state.tasks.find((t) => t.id === proposal?.taskId);
  const project = state.projects.find((p) => p.id === proposalId);
  const members =
    project?.members ??
    state.teamMembers.filter((m) => m.teamId === proposal?.teamId);
  if (
    !proposal ||
    !task ||
    (business
      ? task.ownerId !== BUSINESS_USER_ID
      : !members.some((m) => m.userId === STUDENT_USER_ID))
  )
    return (
      <EmptyState title="Проект недоступен">
        <ActionLink to={business ? "/business" : "/student"}>
          К рабочему столу
        </ActionLink>
      </EmptyState>
    );
  if (state.role !== (business ? "business" : "student"))
    return (
      <section className="panel">
        <h1>Открыть проект</h1>
        <p>
          Для этого действия выберите демо-роль{" "}
          {business ? "бизнеса" : "студента"}.
        </p>
        <Button
          onClick={() =>
            action.run(() =>
              repository.setRole(business ? "business" : "student"),
            )
          }
        >
          Продолжить как {business ? "бизнес" : "студент"}
        </Button>
        <ErrorMessage message={action.error} />
      </section>
    );
  const current = project?.milestones.find((m) => !m.acceptedSubmissionId);
  const team = state.teams.find((t) => t.id === proposal.teamId);
  const events = project
    ? [
        {
          id: project.id,
          at: project.startedAt,
          actor: project.ownerId,
          text: "Проект начат. Условия и состав команды зафиксированы.",
        },
        ...state.submissions
          .filter((s) => s.projectId === project.id)
          .map((s) => ({
            id: s.id,
            at: s.submittedAt,
            actor: s.submittedBy,
            text: `${project.milestones.find((m) => m.id === s.milestoneId)?.title}: версия ${s.version} отправлена`,
            url: s.evidenceUrl,
          })),
        ...state.reviews
          .filter((r) =>
            state.submissions.some(
              (s) => s.id === r.submissionId && s.projectId === project.id,
            ),
          )
          .map((r) => ({
            id: r.id,
            at: r.reviewedAt,
            actor: r.reviewedBy,
            text: `${r.decision === "accepted" ? "Результат принят" : "Запрошены изменения"}. ${r.feedback}`,
          })),
      ].sort((a, b) => a.at.localeCompare(b.at))
    : [];
  return (
    <>
      <PageTrail
        title={task.title}
        to={business ? "/business" : "/student"}
        label="К рабочему столу"
      />
      <div className="page-heading">
        <div>
          <p className="overline">
            {business ? "Контроль проекта" : "Активная миссия"} · {team?.name}
          </p>
          <h1>{project?.brief.title ?? task.title}</h1>
          <p className="intro">
            {project?.completedAt
              ? "Все три результата приняты бизнесом."
              : project
                ? "Один этап — один проверяемый результат."
                : "Команда выбрана. Бизнес задаёт критерии и даты до начала работы."}
          </p>
        </div>
        <span className="status status--success">
          {project?.completedAt
            ? "Завершён"
            : project
              ? "В работе"
              : "Подготовка"}
        </span>
      </div>
      {!project ? (
        business ? (
          <SetupForm
            onStart={(inputs) =>
              action.run(() => repository.startProject(proposal.id, inputs))
            }
            busy={action.busy}
          />
        ) : (
          <section className="panel">
            <h2>Ожидаем начало проекта</h2>
            <p>
              Представитель бизнеса подготовит критерии и сроки трёх этапов.
            </p>
          </section>
        )
      ) : (
        <>
          <section className="panel project-overview">
            <AnimatedProgress
              value={projectProgress(project)}
              label="Принятые этапы"
            />
            <p>
              {project.milestones.filter((m) => m.acceptedSubmissionId).length}{" "}
              / 3 · Процент отражает принятые этапы, а не затраченное время.
            </p>
            <p className="muted">
              Начат {new Date(project.startedAt).toLocaleDateString("ru-RU")} ·{" "}
              {project.skills.join(" · ") || "Навыки не указаны"}
            </p>
          </section>
          <div className="milestone-grid">
            {project.milestones.map((m, index) => {
              const submissions = state.submissions.filter(
                (s) => s.milestoneId === m.id,
              );
              const latest = submissions.at(-1);
              const review = state.reviews.find(
                (r) => r.submissionId === latest?.id,
              );
              const pending = !!latest && !review;
              const active = current?.id === m.id;
              return (
                <section
                  className={`panel milestone ${active ? "milestone--active" : ""}`}
                  key={m.id}
                >
                  <div className="section-heading">
                    <p className="overline">Этап 0{index + 1}</p>
                    <span className="status">
                      {m.acceptedSubmissionId
                        ? "Принят"
                        : pending
                          ? "На проверке"
                          : review
                            ? "Требует доработки"
                            : active
                              ? "Ожидает результата"
                              : "Следующий этап"}
                    </span>
                  </div>
                  <h2>{m.title}</h2>
                  <p>{m.criteria}</p>
                  <p className="muted">
                    Срок: <time dateTime={m.dueDate}>{m.dueDate}</time>
                    {!m.acceptedSubmissionId &&
                    m.dueDate < new Date().toISOString().slice(0, 10)
                      ? " · Просрочен"
                      : ""}
                  </p>
                  {!business && (
                    <p className="xp-reward">
                      +{m.xp} XP за подтверждённый вклад
                    </p>
                  )}
                  {latest && (
                    <div className="evidence-block">
                      <strong>Версия {latest.version}</strong>
                      <p>{latest.summary}</p>
                      <a
                        href={latest.evidenceUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Открыть результат ↗
                      </a>
                      {latest.contributors.map((c) => (
                        <p key={c.userId}>
                          <strong>
                            {state.users.find((u) => u.id === c.userId)?.name}
                          </strong>
                          : {c.description}{" "}
                          <span className="muted">
                            {c.skills.join(" · ")}{" "}
                            {review?.decision === "accepted"
                              ? review.confirmedUserIds.includes(c.userId)
                                ? "· Вклад подтверждён"
                                : "· Вклад не подтверждён"
                              : ""}
                          </span>
                        </p>
                      ))}
                    </div>
                  )}
                  {review?.feedback && (
                    <p className="inline-notice">
                      Обратная связь: {review.feedback}
                    </p>
                  )}
                  {business && pending && (
                    <ReviewForm
                      key={latest.id}
                      submission={latest}
                      busy={action.busy}
                      onReview={(input) =>
                        action.run(() =>
                          repository.reviewSubmission(latest.id, input),
                        )
                      }
                    />
                  )}
                  {!business && active && !pending && (
                    <SubmissionForm
                      key={`${m.id}-${submissions.length}`}
                      project={project}
                      previous={latest}
                      busy={action.busy}
                      onSubmit={(input) =>
                        action.run(() =>
                          repository.submitMilestone(project.id, m.id, input),
                        )
                      }
                    />
                  )}
                </section>
              );
            })}
          </div>
          <details className="panel">
            <summary>Согласованные условия и состав команды</summary>
            <TaskBrief card={project.brief} />
            <p>
              {project.members
                .map(
                  (m) =>
                    `${state.users.find((u) => u.id === m.userId)?.name} (${m.role === "captain" ? "капитан" : "участник"})`,
                )
                .join(" · ")}
            </p>
          </details>
          <section className="panel">
            <h2>История проекта</h2>
            <ol className="project-timeline">
              {events.map((e) => (
                <li key={e.id}>
                  <time>{new Date(e.at).toLocaleString("ru-RU")}</time>
                  <div>
                    <strong>
                      {state.users.find((u) => u.id === e.actor)?.name}
                    </strong>
                    <p>{e.text}</p>
                    {"url" in e && (
                      <a href={e.url} target="_blank" rel="noreferrer">
                        Материалы версии ↗
                      </a>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          </section>
          {project.completedAt && (
            <section className="verified-result">
              <span className="overline">✓ Результат подтверждён в демо</span>
              <h2>{business ? "Проект завершён" : "Миссия завершена"}</h2>
              <p>
                {business
                  ? "Критерии трёх этапов приняты. Все материалы доступны в истории."
                  : "Ваш подтверждённый вклад сохранён в профессиональном профиле."}
              </p>
              {!business && (
                <ActionLink to="/student" variant="primary">
                  Посмотреть прогресс
                </ActionLink>
              )}
            </section>
          )}
        </>
      )}
      <ErrorMessage message={action.error} />
    </>
  );
}
function SetupForm({
  onStart,
  busy,
}: {
  onStart: (stages: StageInput[]) => void;
  busy: boolean;
}) {
  const [inputs, setInputs] = useState<StageInput[]>(
    stages.map(() => ({ criteria: "", dueDate: "" })),
  );
  return (
    <form
      className="panel"
      onSubmit={(e) => {
        e.preventDefault();
        onStart(inputs);
      }}
    >
      <h2>Согласуйте три результата</h2>
      <p>
        Заполните критерии принятия и сроки. После старта условия будут
        зафиксированы.
      </p>
      {stages.map((s, i) => (
        <fieldset key={s.title}>
          <legend>
            {i + 1}. {s.title}
          </legend>
          <label className="field">
            Критерии этапа {i + 1}
            <textarea
              required
              value={inputs[i].criteria}
              onChange={(e) =>
                setInputs(
                  inputs.map((v, n) =>
                    n === i ? { ...v, criteria: e.target.value } : v,
                  ),
                )
              }
            />
          </label>
          <label className="field">
            Срок этапа {i + 1}
            <input
              type="date"
              required
              min={
                i
                  ? inputs[i - 1].dueDate ||
                    new Date().toISOString().slice(0, 10)
                  : new Date().toISOString().slice(0, 10)
              }
              value={inputs[i].dueDate}
              onChange={(e) =>
                setInputs(
                  inputs.map((v, n) =>
                    n === i ? { ...v, dueDate: e.target.value } : v,
                  ),
                )
              }
            />
          </label>
        </fieldset>
      ))}
      <Button disabled={busy}>Зафиксировать условия и начать</Button>
    </form>
  );
}
function SubmissionForm({
  project,
  previous,
  onSubmit,
  busy,
}: {
  project: Project;
  previous?: Submission;
  onSubmit: (input: SubmissionInput) => void;
  busy: boolean;
}) {
  const { state } = useWorkspace();
  const [summary, setSummary] = useState(previous?.summary ?? "");
  const [url, setUrl] = useState(previous?.evidenceUrl ?? "");
  const [contributors, setContributors] = useState<Contribution[]>(
    previous?.contributors ?? [
      { userId: STUDENT_USER_ID, description: "", skills: [] },
    ],
  );
  const change = (id: string, patch: Partial<Contribution>) =>
    setContributors(
      contributors.map((c) => (c.userId === id ? { ...c, ...patch } : c)),
    );
  return (
    <form
      className="stage-form"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({ summary, evidenceUrl: url, contributors });
      }}
    >
      <h3>
        {previous ? "Отправить исправления" : "Передать результат на проверку"}
      </h3>
      <label className="field">
        Что сделано
        <textarea
          required
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
        />
      </label>
      <label className="field">
        Ссылка на результат
        <input
          type="url"
          required
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://…"
        />
      </label>
      <fieldset>
        <legend>Кто участвовал</legend>
        {project.members.map((m) => {
          const c = contributors.find((c) => c.userId === m.userId);
          return (
            <div className="contributor" key={m.userId}>
              <label className="check-row">
                <input
                  type="checkbox"
                  checked={!!c}
                  onChange={(e) =>
                    setContributors(
                      e.target.checked
                        ? [
                            ...contributors,
                            { userId: m.userId, description: "", skills: [] },
                          ]
                        : contributors.filter((v) => v.userId !== m.userId),
                    )
                  }
                />
                {state.users.find((u) => u.id === m.userId)?.name}
              </label>
              {c && (
                <>
                  <label className="field">
                    Вклад: {state.users.find((u) => u.id === m.userId)?.name}
                    <textarea
                      required
                      value={c.description}
                      onChange={(e) =>
                        change(m.userId, { description: e.target.value })
                      }
                    />
                  </label>
                  <div className="skill-options">
                    {project.skills.map((skill) => (
                      <label className="check-row" key={skill}>
                        <input
                          type="checkbox"
                          checked={c.skills.includes(skill)}
                          onChange={(e) =>
                            change(m.userId, {
                              skills: e.target.checked
                                ? [...c.skills, skill]
                                : c.skills.filter((s) => s !== skill),
                            })
                          }
                        />
                        {skill}
                      </label>
                    ))}
                  </div>
                </>
              )}
            </div>
          );
        })}
      </fieldset>
      <Button disabled={busy || !contributors.length}>
        Отправить результат
      </Button>
    </form>
  );
}
function ReviewForm({
  submission,
  onReview,
  busy,
}: {
  submission: Submission;
  onReview: (input: ReviewInput) => void;
  busy: boolean;
}) {
  const { state } = useWorkspace();
  const [feedback, setFeedback] = useState("");
  const [confirmed, setConfirmed] = useState<string[]>([]);
  return (
    <div className="stage-form">
      <h3>Решение по результату</h3>
      <label className="field">
        Обратная связь
        <textarea
          value={feedback}
          onChange={(e) => setFeedback(e.target.value)}
        />
      </label>
      <fieldset>
        <legend>Подтвердите фактический вклад</legend>
        {submission.contributors.map((c) => (
          <label className="check-row" key={c.userId}>
            <input
              type="checkbox"
              checked={confirmed.includes(c.userId)}
              onChange={(e) =>
                setConfirmed(
                  e.target.checked
                    ? [...confirmed, c.userId]
                    : confirmed.filter((id) => id !== c.userId),
                )
              }
            />
            {state.users.find((u) => u.id === c.userId)?.name} ·{" "}
            {c.skills.join(" · ") || "Вклад без отметок навыков"}
          </label>
        ))}
      </fieldset>
      <div className="form-actions">
        <Button
          disabled={busy || !confirmed.length}
          onClick={() =>
            onReview({
              decision: "accepted",
              feedback,
              confirmedUserIds: confirmed,
            })
          }
        >
          Принять результат
        </Button>
        <Button
          variant="secondary"
          disabled={busy || !feedback.trim()}
          onClick={() =>
            onReview({
              decision: "changes_requested",
              feedback,
              confirmedUserIds: [],
            })
          }
        >
          Запросить изменения
        </Button>
      </div>
    </div>
  );
}
