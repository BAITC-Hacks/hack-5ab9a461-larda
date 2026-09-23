import { useLocation } from "react-router-dom";
import { useState } from "react";
import { STUDENT_TEAM_ID } from "../../domain/models";
import { readinessBand } from "../../domain/taskRules";
import { useWorkspace } from "../../app/WorkspaceProvider";
import { ActionLink, EmptyState } from "../../shared/ui/controls";
import { AnimatedProgress } from "../../shared/motion/AnimatedProgress";

export function CatalogPage() {
  const { state } = useWorkspace();
  const { pathname } = useLocation();
  const studentView =
    pathname.startsWith("/student") || state.role !== "business";
  const catalogPath = pathname.startsWith("/student")
    ? "/student/catalog"
    : "/catalog";
  const [topic, setTopic] = useState("");
  const [band, setBand] = useState("");
  const [availableOnly, setAvailableOnly] = useState(false);
  const tasks = state.tasks
    .filter(
      (t) =>
        t.publicationStatus === "published" &&
        (!availableOnly ||
          (t.executionStatus === "not_started" &&
            !state.proposals.some(
              (p) =>
                p.taskId === t.id &&
                (p.teamId === STUDENT_TEAM_ID || p.status === "accepted"),
            ))) &&
        (!topic || t.industry === topic) &&
        (!band || readinessBand(t.readinessScore) === band),
    )
    .sort(
      (a, b) =>
        b.readinessScore - a.readinessScore ||
        (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""),
    );
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="overline">Каталог задач</p>
          <h1>Каталог задач</h1>
          <p className="intro">
            Выберите задачу бизнеса, изучите условия и отправьте предложение от
            команды. Ранг не ограничивает выбор.
          </p>
        </div>
      </div>
      <p className="field-help catalog-demo-note">
        Локальное демо: синтетические примеры и опубликованные вами задачи.
      </p>
      <div className="catalog-toolbar">
        <strong>Задач: {tasks.length}</strong>
        <label>
          Тема{" "}
          <select value={topic} onChange={(e) => setTopic(e.target.value)}>
            <option value="">Все темы</option>
            {[
              ...new Set(
                state.tasks
                  .filter((t) => t.publicationStatus === "published")
                  .map((t) => t.industry),
              ),
            ].map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </label>
        <label>
          Готовность{" "}
          <select value={band} onChange={(e) => setBand(e.target.value)}>
            <option value="">Любая готовность</option>
            {[0, 40, 70, 90].map((n) => (
              <option key={n}>{readinessBand(n)}</option>
            ))}
          </select>
        </label>
        {studentView && (
          <label>
            <input
              type="checkbox"
              checked={availableOnly}
              onChange={(e) => setAvailableOnly(e.target.checked)}
            />{" "}
            Только доступные для моей заявки
          </label>
        )}
        <span>Сначала — с наиболее полной информацией</span>
      </div>
      {tasks.length ? (
        <div className="catalog-grid">
          {tasks.map((task) => {
            const responses = state.proposals.filter(
              (p) => p.taskId === task.id,
            );
            const selected = responses.some((p) => p.status === "accepted");
            const own = studentView
              ? responses.find((p) => p.teamId === STUDENT_TEAM_ID)
              : undefined;
            return (
              <article className="panel catalog-card" key={task.id}>
                <div className="catalog-card__meta">
                  <span>{task.industry}</span>
                  <span>
                    {own
                      ? own.status === "pending"
                        ? "Ваша заявка на рассмотрении"
                        : own.status === "accepted"
                          ? "Ваша команда выбрана"
                          : "Ваша заявка отклонена"
                      : selected || task.executionStatus !== "not_started"
                        ? "Приём завершён"
                        : "Можно подать заявку"}
                  </span>
                </div>
                <h2>{task.title}</h2>
                {studentView && (
                  <p className="xp-reward">
                    До 800 XP · за подтверждённый вклад
                  </p>
                )}
                <p className="muted">
                  {task.skills.join(" · ") || "Навыки уточняются"}
                  {responses.find((p) => p.teamId === STUDENT_TEAM_ID)
                    ? ` · Ваш план: ${responses.find((p) => p.teamId === STUDENT_TEAM_ID)!.durationDays} дней`
                    : ""}
                </p>
                <span className="status">
                  {readinessBand(task.readinessScore)}
                </span>
                <p className="catalog-problem">{task.context}</p>
                <div className="catalog-result">
                  <span>Что нужно сделать</span>
                  <p>{task.expectedResult}</p>
                </div>
                <AnimatedProgress
                  value={task.readinessScore}
                  label="Готовность задачи"
                  compact
                />
                <div className="catalog-card__footer">
                  <p>
                    {task.availableData
                      ? "Данные описаны"
                      : "Данные не указаны"}{" "}
                    · Отклики: {responses.length}
                  </p>
                  <ActionLink to={`${catalogPath}/${task.id}`}>
                    Открыть задачу <span aria-hidden="true">→</span>
                  </ActionLink>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <EmptyState title="Задач пока нет">
          <p>Опубликованные задачи появятся здесь.</p>
          <ActionLink to="/">К выбору роли</ActionLink>
        </EmptyState>
      )}
    </>
  );
}
