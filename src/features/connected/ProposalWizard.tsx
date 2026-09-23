import { useEffect, useRef, useState } from "react";
import type { ServerTeam } from "../../data/backendClient";
import { Button, ErrorMessage } from "../../shared/ui/controls";

export interface ProposalBody {
  team_id: number;
  solution_idea: string;
  plan: string;
  duration_days: number;
  prototype_url?: string;
}
export interface ProposalWizardProps {
  teams: ServerTeam[];
  busy: boolean;
  onSubmit: (body: ProposalBody) => Promise<void>;
  onBack: () => void;
}

function validUrl(value: string) {
  if (!value.trim()) return true;
  try {
    const url = new URL(value.trim());
    return (
      ["http:", "https:"].includes(url.protocol) &&
      !!url.hostname &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
}

/** All fields stay mounted in component state while moving between steps. */
export function ProposalWizard({
  teams,
  busy,
  onSubmit,
  onBack,
}: ProposalWizardProps) {
  const [step, setStep] = useState(0);
  const [teamId, setTeamId] = useState(teams[0]?.id ?? 0);
  const [idea, setIdea] = useState("");
  const [plan, setPlan] = useState("");
  const [days, setDays] = useState("7");
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);
  const running = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus();
  }, [step, sent]);
  const locked = busy || pending;
  const team = teams.find((candidate) => candidate.id === teamId);
  const steps = ["Идея", "План", "Отправка"];
  function back() {
    setError(null);
    if (step > 0 && !sent) setStep(step - 1);
    else onBack();
  }
  async function submit() {
    if (running.current || busy) return;
    if (!team || !idea.trim()) {
      setStep(0);
      setError("Выберите команду и опишите идею решения.");
      return;
    }
    if (
      !plan.trim() ||
      !Number.isSafeInteger(Number(days)) ||
      Number(days) < 1 ||
      !validUrl(url)
    ) {
      setStep(1);
      setError("Проверьте план, срок и ссылку на прототип.");
      return;
    }
    running.current = true;
    setPending(true);
    setError(null);
    try {
      await onSubmit({
        team_id: teamId,
        solution_idea: idea.trim(),
        plan: plan.trim(),
        duration_days: Number(days),
        ...(url.trim() ? { prototype_url: url.trim() } : {}),
      });
      setSent(true);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Не удалось отправить заявку. Попробуйте ещё раз.",
      );
    } finally {
      running.current = false;
      setPending(false);
    }
  }
  return (
    <section className="flow-card" aria-label="Подать заявку">
      <header className="flow-header">
        <Button
          className="flow-back"
          variant="quiet"
          disabled={locked}
          onClick={back}
        >
          ← Назад
        </Button>
        {!sent && <span className="field-help">Шаг {step + 1} из 3</span>}
      </header>
      {!sent && (
        <ol className="flow-stepper" aria-label="Этапы заявки">
          {steps.map((label, index) => (
            <li key={label} aria-current={step === index ? "step" : undefined}>
              <span aria-hidden="true">{index + 1}</span> {label}
            </li>
          ))}
        </ol>
      )}
      <h2 ref={heading} tabIndex={-1}>
        {sent
          ? "Заявка отправлена"
          : ["Предложите решение", "Как вы это сделаете?", "Проверьте заявку"][
              step
            ]}
      </h2>
      <ErrorMessage message={error} />
      {sent ? (
        <div>
          <p role="status">
            Бизнес получил предложение команды «{team?.name}». Решение появится
            в разделе «Мои проекты».
          </p>
          <div className="flow-actions">
            <Button onClick={onBack}>К задаче</Button>
          </div>
        </div>
      ) : (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            setError(null);
            if (step === 0) {
              if (!team || !idea.trim()) {
                setError("Выберите команду и опишите идею решения.");
                return;
              }
              setStep(1);
            } else if (step === 1) {
              if (!plan.trim()) {
                setError("Опишите основные шаги работы.");
                return;
              }
              if (!Number.isSafeInteger(Number(days)) || Number(days) < 1) {
                setError("Укажите срок целым числом дней, от 1.");
                return;
              }
              if (!validUrl(url)) {
                setError("Нужна ссылка HTTP(S) без логина и пароля.");
                return;
              }
              setStep(2);
            } else void submit();
          }}
        >
          {step === 0 && (
            <>
              <p>Коротко объясните, как ваша команда поможет бизнесу.</p>
              <label className="field">
                Команда
                <select
                  required
                  value={teamId}
                  disabled={locked}
                  onChange={(event) => setTeamId(Number(event.target.value))}
                >
                  {!teams.length && (
                    <option value="">Нет доступных команд</option>
                  )}
                  {teams.map((candidate) => (
                    <option key={candidate.id} value={candidate.id}>
                      {candidate.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                Идея решения
                <textarea
                  rows={5}
                  required
                  value={idea}
                  disabled={locked}
                  onChange={(event) => setIdea(event.target.value)}
                  placeholder="Что предлагаете создать и какую проблему это решит?"
                />
              </label>
            </>
          )}
          {step === 1 && (
            <>
              <label className="field">
                План работы
                <textarea
                  rows={5}
                  required
                  value={plan}
                  disabled={locked}
                  onChange={(event) => setPlan(event.target.value)}
                  placeholder="Например: изучим процесс, проверим идею, покажем рабочий прототип."
                />
              </label>
              <label className="field">
                Срок в днях
                <input
                  type="number"
                  min="1"
                  step="1"
                  required
                  value={days}
                  disabled={locked}
                  onChange={(event) => setDays(event.target.value)}
                />
              </label>
              <label className="field">
                Прототип (необязательно)
                <input
                  type="url"
                  pattern="https?://.+"
                  value={url}
                  disabled={locked}
                  onChange={(event) => setUrl(event.target.value)}
                  placeholder="https://"
                />
              </label>
            </>
          )}
          {step === 2 && (
            <>
              <dl className="brief">
                <div>
                  <dt>Команда</dt>
                  <dd>{team?.name ?? "Выберите команду"}</dd>
                </div>
                <div>
                  <dt>Идея решения</dt>
                  <dd>{idea}</dd>
                </div>
                <div>
                  <dt>План работы</dt>
                  <dd>{plan}</dd>
                </div>
                <div>
                  <dt>Срок</dt>
                  <dd>{days} дней</dd>
                </div>
                {url.trim() && (
                  <div>
                    <dt>Прототип</dt>
                    <dd>{url.trim()}</dd>
                  </div>
                )}
              </dl>
              <p className="field-help">
                После отправки бизнес рассмотрит заявку. Работа начнётся после
                выбора команды.
              </p>
            </>
          )}
          <div className="flow-actions">
            <Button
              disabled={locked || (step === 0 && (!team || !idea.trim()))}
            >
              {step === 0
                ? "К плану работы"
                : step === 1
                  ? "Проверить заявку"
                  : "Отправить заявку"}
            </Button>
          </div>
        </form>
      )}
      {!sent && (
        <Button
          className="flow-exit"
          variant="quiet"
          disabled={locked}
          onClick={onBack}
        >
          Вернуться к задаче
        </Button>
      )}
    </section>
  );
}
