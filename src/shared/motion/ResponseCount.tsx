export interface ResponseCountProps {
  count: number;
  highlight?: boolean;
}

export function ResponseCount({
  count,
  highlight = false,
}: ResponseCountProps) {
  const safeCount = Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
  return (
    <span
      className="motion-response-count"
      aria-live="polite"
      aria-atomic="true"
    >
      <span
        key={safeCount}
        className={highlight ? "motion-response-count__highlight" : undefined}
      >
        Отклики команд ·{" "}
        <span className="motion-response-count__number">{safeCount}</span>
      </span>
    </span>
  );
}
