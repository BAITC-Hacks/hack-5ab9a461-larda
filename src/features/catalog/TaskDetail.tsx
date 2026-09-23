import { useState } from "react";
import { useParams, useLocation } from "react-router-dom";
import { useWorkspace } from "../../app/WorkspaceProvider";
import { STUDENT_TEAM_ID, type ProposalInput } from "../../domain/models";
import {
  ActionLink,
  Button,
  EmptyState,
  ErrorMessage,
  PageTrail,
  useAction,
} from "../../shared/ui/controls";
import { TaskBrief } from "../../shared/ui/TaskBrief";
import { AnimatedProgress } from "../../shared/motion/AnimatedProgress";
import { SaveConfirmation } from "../../shared/motion/SaveConfirmation";

export function TaskDetail() {
  const { id } = useParams();
  const { pathname } = useLocation();
  const catalogPath = pathname.startsWith("/student")
    ? "/student/catalog"
    : "/catalog";
  const { state, repository } = useWorkspace();
  const task = state.tasks.find(
    (t) => t.id === id && t.publicationStatus === "published",
  );
  const action = useAction();
  const [formOpen, setFormOpen] = useState(false);
  if (!task)
    return (
      <EmptyState title="Задача недоступна">
        <p>Она ещё не опубликована или уже убрана из каталога.</p>
        <ActionLink to={catalogPath}>К каталогу задач</ActionLink>
      </EmptyState>
    );
  const response = state.proposals.find(
    (p) => p.taskId === task.id && p.teamId === STUDENT_TEAM_ID,
  );
  const selected = state.proposals.some(
    (p) => p.taskId === task.id && p.status === "accepted",
  );
  return (
    <>
      <PageTrail title={task.title} to={catalogPath} label="К каталогу задач" />
      <div className="page-heading">
        <div>
          <p className="overline">{task.industry}</p>
          <h1>{task.title}</h1>
          <p className="intro">
            От компании:{" "}
            {state.users.find((u) => u.id === task.ownerId)?.companyName ??
              "Бизнес"}
          </p>
        </div>
      </div>
      <div className="workspace-grid">
        <section className="panel">
          <p className="overline">От проблемы — к понятной задаче</p>
          <TaskBrief card={task} />
        </section>
        <aside className="panel task-preview">
          <AnimatedProgress
            value={task.readinessScore}
            label="Готовность задачи"
          />
          {state.role !== "business" && (
            <p className="xp-reward">
              До 800 XP каждому подтверждённому участнику
            </p>
          )}
          <p>{task.skills.join(" · ")}</p>
          <h2>Предложите свой подход</h2>
          <p>
            Расскажите, что сделает ваша команда, сколько времени понадобится и
            как вы начнёте.
          </p>
          {response ? (
            <div className="response-receipt">
              <span className="status status--success">
                {response.status === "accepted"
                  ? "Ваша команда выбрана"
                  : response.status === "rejected"
                    ? "Отклик отклонён"
                    : "Отклик отправлен"}
              </span>
              <p>
                {response.status === "pending"
                  ? "Представитель бизнеса рассмотрит ваш план и примет решение."
                  : "Решение представителя бизнеса сохранено."}
              </p>
              <p>
                <strong>Ваше предложение:</strong>
                <br />
                {response.solutionIdea}
              </p>
              {response.status === "accepted" && (
                <ActionLink to={`/student/projects/${response.id}`}>
                  Открыть миссию
                </ActionLink>
              )}
              <ActionLink to={catalogPath}>Посмотреть другие задачи</ActionLink>
            </div>
          ) : selected || task.executionStatus !== "not_started" ? (
            <p className="helper-note">Приём откликов завершён.</p>
          ) : state.role !== "student" ? (
            <Button
              onClick={() =>
                action.run(async () => {
                  await repository.setRole("student");
                })
              }
            >
              Перейти к отклику как студент
            </Button>
          ) : !formOpen ? (
            <Button className="full-width" onClick={() => setFormOpen(true)}>
              Подать предложение
            </Button>
          ) : (
            <p className="helper-note">
              Заполните форму ниже. Отклик отправляется от команды «Нова».
            </p>
          )}
          <ErrorMessage message={action.error} />
          <SaveConfirmation message={action.message} />
        </aside>
      </div>
      {formOpen && !response && !selected && (
        <ProposalForm
          busy={action.busy}
          error={action.error}
          onSubmit={(input) =>
            action.run(async () => {
              await repository.submitProposal(task.id, input);
              setFormOpen(false);
              action.confirm("Отклик отправлен бизнесу");
            })
          }
        />
      )}
    </>
  );
}

function ProposalForm({
  busy,
  error,
  onSubmit,
}: {
  busy: boolean;
  error: string | null;
  onSubmit: (input: ProposalInput) => void;
}) {
  const [value, setValue] = useState<ProposalInput>({
    solutionIdea: "",
    plan: "",
    durationDays: 5,
    prototypeUrl: "",
  });
  return (
    <section className="panel proposal-form motion-question-enter">
      <p className="overline">Команда «Нова» · вы капитан</p>
      <h2>Ваш отклик на задачу</h2>
      <p>Бизнес сравнит идеи и планы команд. Выбор сделает человек.</p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit(value);
        }}
      >
        <label className="field">
          Идея решения
          <textarea
            required
            rows={3}
            value={value.solutionIdea}
            onChange={(e) =>
              setValue({ ...value, solutionIdea: e.target.value })
            }
            autoFocus
          />
        </label>
        <label className="field">
          Краткий план
          <textarea
            required
            rows={4}
            value={value.plan}
            onChange={(e) => setValue({ ...value, plan: e.target.value })}
          />
        </label>
        <div className="form-columns">
          <label className="field">
            Срок в днях
            <input
              type="number"
              min={1}
              step={1}
              required
              value={value.durationDays}
              onChange={(e) =>
                setValue({ ...value, durationDays: Number(e.target.value) })
              }
            />
          </label>
          <label className="field">
            Ссылка на прототип или код
            <span className="field-help">
              Необязательно, если прототипа ещё нет
            </span>
            <input
              type="url"
              placeholder="https://…"
              value={value.prototypeUrl}
              onChange={(e) =>
                setValue({ ...value, prototypeUrl: e.target.value })
              }
            />
          </label>
        </div>
        <ErrorMessage message={error} />
        <Button disabled={busy}>Отправить отклик</Button>
      </form>
    </section>
  );
}
