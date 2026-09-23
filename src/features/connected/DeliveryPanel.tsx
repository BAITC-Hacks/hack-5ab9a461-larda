import { useState } from "react";
import type {
  ServerMilestone,
  ServerProposal,
  ServerTask,
  ServerTeam,
  ServerUser,
} from "../../data/backendClient";
import { Button, ErrorMessage, useAction } from "../../shared/ui/controls";

export interface DeliveryPanelProps {
  task: ServerTask;
  user: ServerUser;
  teams: ServerTeam[];
  proposals: ServerProposal[];
  busy: boolean;
  request: <T>(path: string, method?: string, body?: unknown) => Promise<T>;
}

function evidenceLink(value: string | null) {
  if (!value) return null;
  try {
    const url = new URL(value.trim());
    return ["http:", "https:"].includes(url.protocol) &&
      url.hostname &&
      !url.username &&
      !url.password
      ? url.href
      : null;
  } catch {
    return null;
  }
}
const statuses: Record<string, string> = {
  pending: "На рассмотрении",
  accepted: "Команда выбрана",
  rejected: "Заявка отклонена",
  in_progress: "В работе",
  completed: "Завершено",
  cancelled: "Отменено",
};

export function DeliveryPanel({
  task,
  user,
  teams,
  proposals,
  busy,
  request,
}: DeliveryPanelProps) {
  const action = useAction();
  const owner = user.role === "business" && task.owner_id === user.id;
  // Keep the completion gate scoped even if a caller supplies its full inbox.
  const taskProposals = proposals.filter(
    (proposal) => proposal.task_id === task.id,
  );
  const canComplete =
    taskProposals.some(
      (p) => p.status === "accepted" && p.execution_status === "completed",
    ) &&
    taskProposals.every(
      (p) =>
        p.status !== "accepted" ||
        ["completed", "cancelled"].includes(p.execution_status),
    );
  return (
    <section
      className="workspace-section"
      aria-label={owner ? "Заявки команд и результаты" : "Работа над задачей"}
    >
      <div className="section-heading">
        <h2>{owner ? "Команды и результаты" : "Мои проекты по задаче"}</h2>
        <span className="field-help">{taskProposals.length} заявок</span>
      </div>
      {!taskProposals.length && (
        <p className="field-help">
          {owner
            ? "Здесь появятся предложения команд. Выберите подходящее, чтобы начать работу."
            : "Ваших заявок пока нет. Предложите решение, чтобы начать."}
        </p>
      )}
      {taskProposals.map((proposal) => (
        <ProposalDelivery
          key={proposal.id}
          proposal={proposal}
          team={teams.find((team) => team.id === proposal.team_id)}
          owner={owner}
          user={user}
          busy={busy || action.busy}
          request={request}
        />
      ))}
      {owner && task.execution_status === "in_progress" && canComplete && (
        <div className="workspace-card">
          <h3>Результаты команд приняты</h3>
          <p>
            Подтвердите завершение задачи, чтобы зафиксировать общий результат.
          </p>
          <ErrorMessage message={action.error} />
          <Button
            disabled={busy || action.busy}
            onClick={() =>
              void action.run(async () => {
                await request(`/tasks/${task.id}/complete`, "POST");
              })
            }
          >
            Подтвердить завершение всей задачи
          </Button>
        </div>
      )}
      {task.execution_status === "completed" && (
        <p className="status status--success" role="status">
          Задача завершена · результат подтверждён бизнесом
        </p>
      )}
    </section>
  );
}

function ProposalDelivery({
  proposal,
  team,
  owner,
  user,
  busy,
  request,
}: {
  proposal: ServerProposal;
  team?: ServerTeam;
  owner: boolean;
  user: ServerUser;
  busy: boolean;
  request: DeliveryPanelProps["request"];
}) {
  const action = useAction();
  const [stageOpen, setStageOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [reward, setReward] = useState("800");
  const locked = busy || action.busy;
  const captain =
    user.role === "student" &&
    !!team?.members?.some(
      (member) => member.user_id === user.id && member.role === "captain",
    );
  const active =
    proposal.status === "accepted" &&
    proposal.execution_status === "in_progress";
  const milestones = proposal.milestones ?? [];
  const approved = milestones.filter((milestone) => !!milestone.approved_at);
  const completed = approved.filter(
    (milestone) => milestone.status === "completed",
  );
  const canComplete =
    approved.length > 0 && completed.length === approved.length;
  const next = owner
    ? (milestones.find((milestone) => milestone.status === "submitted") ??
      milestones.find((milestone) => !milestone.approved_at))
    : milestones.find(
        (milestone) =>
          milestone.approved_at &&
          ["pending", "rejected"].includes(milestone.status),
      );
  const nextAction =
    proposal.status === "pending"
      ? owner
        ? "Рассмотрите предложение и выберите команду."
        : "Бизнес рассматривает вашу заявку."
      : !active
        ? (statuses[proposal.execution_status] ?? statuses[proposal.status])
        : owner && next?.status === "submitted"
          ? `Проверьте результат: ${next.title}`
          : owner && next && !next.approved_at
            ? `Согласуйте этап: ${next.title}`
            : !milestones.length
              ? owner
                ? "Добавьте первый этап и критерии приёмки."
                : "Бизнес готовит первый этап работы."
              : canComplete
                ? owner
                  ? "Все согласованные этапы приняты. Завершите работу команды."
                  : "Все этапы приняты. Ожидаем завершения проекта бизнесом."
                : captain && next
                  ? `Следующий результат: ${next.title}`
                  : owner
                    ? "Команда работает над согласованными этапами."
                    : "Ожидаем следующий шаг команды или бизнеса.";
  const mutate = (path: string, body?: unknown) =>
    void action.run(async () => {
      await request(path, "POST", body);
    });
  return (
    <article className="workspace-card">
      <header className="section-heading">
        <div>
          <span className="overline">Заявка №{proposal.id}</span>
          <h3>{team?.name ?? `Команда №${proposal.team_id}`}</h3>
        </div>
        <span
          className={`status ${proposal.execution_status === "completed" ? "status--success" : "status--pending"}`}
        >
          {proposal.status === "accepted"
            ? (statuses[proposal.execution_status] ?? "Команда выбрана")
            : (statuses[proposal.status] ?? proposal.status)}
        </span>
      </header>
      <p>{proposal.solution_idea}</p>
      <details>
        <summary>План команды · {proposal.duration_days} дней</summary>
        <p>{proposal.plan}</p>
      </details>
      <p className="inline-notice">{nextAction}</p>
      <ErrorMessage message={action.error} />
      {owner && proposal.status === "pending" && (
        <div className="flow-actions">
          <Button
            disabled={locked}
            onClick={() =>
              mutate(`/proposals/${proposal.id}/decision`, {
                status: "accepted",
              })
            }
          >
            Выбрать команду
          </Button>
          <Button
            variant="quiet"
            disabled={locked}
            onClick={() =>
              mutate(`/proposals/${proposal.id}/decision`, {
                status: "rejected",
              })
            }
          >
            Отклонить заявку
          </Button>
        </div>
      )}
      {proposal.status === "accepted" && (
        <>
          {approved.length > 0 && (
            <div className="delivery-progress">
              <label htmlFor={`proposal-progress-${proposal.id}`}>
                Принято этапов: {completed.length} / {approved.length}
              </label>
              <progress
                id={`proposal-progress-${proposal.id}`}
                max={approved.length}
                value={completed.length}
              />
            </div>
          )}
          <div className="delivery-timeline">
            {milestones.map((milestone) => (
              <MilestoneDelivery
                key={milestone.id}
                milestone={milestone}
                active={active}
                owner={owner}
                captain={captain}
                busy={locked}
                request={request}
              />
            ))}
          </div>
          {owner && active && (
            <>
              {stageOpen ? (
                <form
                  className="delivery-stage-form"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void action.run(async () => {
                      if (!title.trim() || !description.trim())
                        throw new Error(
                          "Укажите название и критерии результата.",
                        );
                      if (
                        !Number.isSafeInteger(Number(reward)) ||
                        Number(reward) < 0
                      )
                        throw new Error(
                          "XP должен быть целым неотрицательным числом.",
                        );
                      await request(
                        `/proposals/${proposal.id}/milestones`,
                        "POST",
                        {
                          title: title.trim(),
                          description: description.trim(),
                          exp_reward: Number(reward),
                        },
                      );
                      setStageOpen(false);
                      setTitle("");
                      setDescription("");
                      setReward("800");
                    });
                  }}
                >
                  <h4>Новый этап</h4>
                  <label className="field">
                    Название этапа
                    <input
                      required
                      value={title}
                      disabled={locked}
                      onChange={(event) => setTitle(event.target.value)}
                    />
                  </label>
                  <label className="field">
                    Критерии результата
                    <textarea
                      required
                      rows={3}
                      value={description}
                      disabled={locked}
                      onChange={(event) => setDescription(event.target.value)}
                    />
                  </label>
                  <details>
                    <summary>Настроить награду команды</summary>
                    <label className="field">
                      XP на команду
                      <input
                        type="number"
                        min="0"
                        step="1"
                        required
                        value={reward}
                        disabled={locked}
                        onChange={(event) => setReward(event.target.value)}
                      />
                    </label>
                    <p className="field-help">
                      После принятия результата опыт делится между участниками
                      команды.
                    </p>
                  </details>
                  <div className="flow-actions">
                    <Button disabled={locked}>Сохранить этап</Button>
                    <Button
                      type="button"
                      variant="quiet"
                      disabled={locked}
                      onClick={() => setStageOpen(false)}
                    >
                      Назад
                    </Button>
                  </div>
                </form>
              ) : (
                <Button
                  variant="secondary"
                  disabled={locked}
                  onClick={() => setStageOpen(true)}
                >
                  Добавить этап
                </Button>
              )}
              {canComplete && (
                <Button
                  disabled={locked}
                  onClick={() => mutate(`/proposals/${proposal.id}/complete`)}
                >
                  Завершить работу команды
                </Button>
              )}
            </>
          )}
        </>
      )}
    </article>
  );
}

function MilestoneDelivery({
  milestone,
  active,
  owner,
  captain,
  busy,
  request,
}: {
  milestone: ServerMilestone;
  active: boolean;
  owner: boolean;
  captain: boolean;
  busy: boolean;
  request: DeliveryPanelProps["request"];
}) {
  const action = useAction();
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState(milestone.result_url ?? "");
  const locked = busy || action.busy;
  const link = evidenceLink(milestone.result_url);
  const completed = milestone.status === "completed";
  const label = !milestone.approved_at
    ? "Ожидает согласования"
    : completed
      ? "Принят бизнесом"
      : milestone.status === "submitted"
        ? "На проверке"
        : milestone.status === "rejected"
          ? "Нужна доработка"
          : "В работе";
  const mutate = (path: string, body?: unknown) =>
    void action.run(async () => {
      await request(path, "POST", body);
    });
  return (
    <section className={`delivery-stage ${completed ? "is-complete" : ""}`}>
      <div className="section-heading">
        <h4>{milestone.title}</h4>
        <span className={completed ? "status status--success" : "field-help"}>
          {label}
        </span>
      </div>
      <p>{milestone.description}</p>
      {!owner && (
        <p className="field-help">
          {milestone.exp_reward} XP на команду после принятия результата
        </p>
      )}
      {link && (
        <a href={link} target="_blank" rel="noreferrer">
          Открыть результат ↗
        </a>
      )}
      <ErrorMessage message={action.error} />
      {active && owner && !milestone.approved_at && (
        <Button
          disabled={locked}
          onClick={() => mutate(`/milestones/${milestone.id}/approve`)}
        >
          Согласовать этап
        </Button>
      )}
      {active && owner && milestone.status === "submitted" && (
        <div className="flow-actions">
          <Button
            disabled={locked}
            onClick={() =>
              mutate(`/milestones/${milestone.id}/review`, { accepted: true })
            }
          >
            Принять результат
          </Button>
          <Button
            variant="secondary"
            disabled={locked}
            onClick={() =>
              mutate(`/milestones/${milestone.id}/review`, { accepted: false })
            }
          >
            Вернуть на доработку
          </Button>
        </div>
      )}
      {active &&
        captain &&
        !!milestone.approved_at &&
        ["pending", "rejected"].includes(milestone.status) &&
        (open ? (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void action.run(async () => {
                const result = evidenceLink(url);
                if (!result)
                  throw new Error(
                    "Укажите HTTP(S) ссылку без логина и пароля.",
                  );
                await request(`/milestones/${milestone.id}/submit`, "POST", {
                  result_url: result,
                });
                setOpen(false);
              });
            }}
          >
            <label className="field">
              Ссылка на результат
              <input
                type="url"
                pattern="https?://.+"
                required
                value={url}
                disabled={locked}
                onChange={(event) => setUrl(event.target.value)}
                placeholder="https://"
              />
            </label>
            <div className="flow-actions">
              <Button disabled={locked}>Отправить результат</Button>
              <Button
                type="button"
                variant="quiet"
                disabled={locked}
                onClick={() => setOpen(false)}
              >
                Назад
              </Button>
            </div>
          </form>
        ) : (
          <Button disabled={locked} onClick={() => setOpen(true)}>
            {milestone.status === "rejected"
              ? "Исправить результат"
              : "Сдать этап"}
          </Button>
        ))}
    </section>
  );
}
