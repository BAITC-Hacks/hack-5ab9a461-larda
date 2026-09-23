import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { useWorkspace } from "../../app/WorkspaceProvider";
import { BUSINESS_USER_ID } from "../../domain/models";
import {
  Button,
  ActionLink,
  EmptyState,
  ErrorMessage,
  PageTrail,
  useAction,
} from "../../shared/ui/controls";
import { SaveConfirmation } from "../../shared/motion/SaveConfirmation";
import { ResponseCount } from "../../shared/motion/ResponseCount";

export function ResponsesPage() {
  const { id } = useParams();
  const { state, repository } = useWorkspace();
  const task = state.tasks.find(
    (t) => t.id === id && t.ownerId === BUSINESS_USER_ID,
  );
  const responses = state.proposals.filter((p) => p.taskId === id);
  const selected = responses.find((p) => p.status === "accepted");
  const [choice, setChoice] = useState("");
  const [newResponses] = useState(() =>
    responses.some((p) => !state.seenProposalIds.includes(p.id)),
  );
  const [seenError, setSeenError] = useState<string | null>(null);
  const action = useAction();
  useEffect(() => {
    if (task)
      void repository
        .markResponsesSeen(task.id)
        .catch(() => setSeenError("Не удалось сохранить отметку о просмотре."));
  }, [task?.id, repository]);
  if (!task)
    return (
      <EmptyState title="Задача не найдена">
        <ActionLink to="/business/tasks">К моим задачам</ActionLink>
      </EmptyState>
    );
  return (
    <>
      <PageTrail
        title="Отклики команд"
        to={`/business/tasks/${task.id}`}
        label="К задаче"
      />
      <div className="page-heading">
        <div>
          <p className="overline">{task.title}</p>
          <h1>Отклики команд</h1>
          <p className="intro">
            Сравните идеи и планы. Выбор команды остаётся за вами.
          </p>
        </div>
        <span className="response-total">
          <ResponseCount count={responses.length} highlight={newResponses} />
        </span>
      </div>
      {newResponses && (
        <p className="inline-notice">
          Новый отклик команды получен. Ознакомьтесь с предложением ниже.
        </p>
      )}
      {selected && (
        <section className="selection-result motion-answer-saved">
          <span aria-hidden="true">✓</span>
          <div>
            <strong>
              Команда выбрана:{" "}
              {state.teams.find((t) => t.id === selected.teamId)?.name}
            </strong>
            <p>
              Решение сохранено. Остальные отклики не отклоняются автоматически.
            </p>
          </div>
          <ActionLink to="/business">К рабочему столу</ActionLink>
        </section>
      )}
      <ErrorMessage message={seenError} />
      {responses.length === 0 ? (
        <EmptyState title="Пока нет откликов">
          <p>
            Когда команда предложит решение, здесь появятся её идея, план и
            срок.
          </p>
          <ActionLink to={`/catalog/${task.id}`}>
            Посмотреть опубликованную задачу
          </ActionLink>
        </EmptyState>
      ) : (
        <>
          <div className="proposals-grid">
            {responses.map((response) => (
              <article
                key={response.id}
                className={`panel proposal-card proposal-card--${response.status} ${choice === response.id ? "proposal-card--chosen" : ""}`}
              >
                <div className="proposal-card__heading">
                  <span className="team-avatar" aria-hidden="true">
                    К
                  </span>
                  <div>
                    <h2>
                      {state.teams.find((t) => t.id === response.teamId)
                        ?.name ?? "Команда"}
                    </h2>
                    <p>{response.durationDays} дней на решение</p>
                  </div>
                </div>
                <dl className="brief">
                  <div>
                    <dt>Идея решения</dt>
                    <dd>{response.solutionIdea}</dd>
                  </div>
                  <div>
                    <dt>Краткий план</dt>
                    <dd>{response.plan}</dd>
                  </div>
                  <div>
                    <dt>Прототип или код</dt>
                    <dd>
                      {response.prototypeUrl ? (
                        <a
                          href={response.prototypeUrl}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Открыть ссылку ↗
                        </a>
                      ) : (
                        "Ссылка пока не добавлена"
                      )}
                    </dd>
                  </div>
                </dl>
                <div className="proposal-decision">
                  {response.status === "accepted" ? (
                    <span className="status status--success">
                      ✓ Команда выбрана
                    </span>
                  ) : response.status === "rejected" ? (
                    <span className="status">Отклонено</span>
                  ) : (
                    <>
                      {!selected && (
                        <label className="team-choice">
                          <input
                            type="radio"
                            name="team"
                            value={response.id}
                            checked={choice === response.id}
                            onChange={() => setChoice(response.id)}
                          />
                          Выбрать эту команду
                        </label>
                      )}
                      <Button
                        variant="danger"
                        disabled={action.busy}
                        onClick={() =>
                          action.run(async () => {
                            await repository.decideProposal(
                              response.id,
                              "rejected",
                            );
                            if (choice === response.id) setChoice("");
                            action.confirm("Отклик отклонён");
                          })
                        }
                      >
                        Отклонить
                      </Button>
                    </>
                  )}
                </div>
              </article>
            ))}
          </div>
          <div className="decision-bar">
            <div>
              <SaveConfirmation message={action.message} />
              <ErrorMessage message={action.error} />
              {!selected && (
                <p className="muted">
                  {choice
                    ? "Подтвердите выбор. Остальные отклики сохранят свой статус."
                    : "Отметьте подходящую команду, затем подтвердите выбор."}
                </p>
              )}
            </div>
            {!selected && responses.some((p) => p.status === "pending") && (
              <Button
                disabled={!choice || action.busy}
                onClick={() =>
                  action.run(async () => {
                    await repository.decideProposal(choice, "accepted");
                    action.confirm("Команда выбрана");
                  })
                }
              >
                Выбрать команду
              </Button>
            )}
          </div>
        </>
      )}
    </>
  );
}
