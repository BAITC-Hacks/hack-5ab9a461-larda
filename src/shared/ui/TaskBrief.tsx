import type { TaskCard } from "../../domain/models";

export const cardFields: { key: keyof TaskCard; label: string }[] = [
  { key: "context", label: "Как объяснил бизнес" },
  { key: "expectedResult", label: "Что нужно сделать команде" },
  { key: "successCriteria", label: "Как оценить результат" },
  { key: "availableData", label: "Данные от компании" },
  { key: "constraints", label: "Ограничения и что не нужно делать" },
  { key: "interactionFormat", label: "Формат работы" },
  { key: "feedbackProcess", label: "Обратная связь" },
];
export function TaskBrief({
  card,
  compact = false,
}: {
  card: TaskCard;
  compact?: boolean;
}) {
  return (
    <dl className={`brief ${compact ? "brief--compact" : ""}`}>
      {cardFields
        .filter((_, index) => !compact || index < 4)
        .map((field) => (
          <div
            key={field.key}
            className={field.key === "context" ? "brief__source" : ""}
          >
            <dt>{field.label}</dt>
            <dd>
              {card[field.key] || (
                <span className="muted">Пока не указано</span>
              )}
            </dd>
          </div>
        ))}
    </dl>
  );
}
