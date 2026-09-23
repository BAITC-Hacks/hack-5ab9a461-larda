import { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from './useReducedMotion';

export interface AnimatedProgressProps {
  value: number;
  max?: number;
  label: string;
  compact?: boolean;
}

export function AnimatedProgress({ value, max = 100, label, compact = false }: AnimatedProgressProps) {
  const limit = Number.isFinite(max) && max > 0 ? max : 100;
  const target = Number.isFinite(value) ? Math.min(limit, Math.max(0, value)) : 0;
  const reducedMotion = useReducedMotion();
  const [displayValue, setDisplayValue] = useState(target);
  const current = useRef(target);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (reducedMotion) {
      current.current = target;
      setDisplayValue(target);
      return;
    }

    const from = current.current;
    if (from === target) return;

    // Read the same token as the bar, so product-wide motion changes stay in sync.
    const token = root.current
      ? getComputedStyle(root.current).getPropertyValue('--motion-normal').trim()
      : '';
    const duration = token.endsWith('ms') ? Number.parseFloat(token)
      : token.endsWith('s') ? Number.parseFloat(token) * 1000 : 220;
    const safeDuration = Number.isFinite(duration) && duration > 0 ? duration : 220;
    const start = performance.now();
    let frame = 0;

    function tick(now: number) {
      const elapsed = Math.min(1, (now - start) / safeDuration);
      const eased = 1 - (1 - elapsed) ** 3;
      current.current = from + (target - from) * eased;
      setDisplayValue(current.current);
      if (elapsed < 1) frame = requestAnimationFrame(tick);
    }

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, reducedMotion]);

  return (
    <div ref={root} className={`motion-progress${compact ? ' motion-progress--compact' : ''}`}>
      <div className="motion-progress__caption" aria-hidden="true">
        <span>{label}</span>
        <strong>{Math.round(reducedMotion ? target : displayValue)} <span>из {limit}</span></strong>
      </div>
      <div className="motion-progress__track" role="progressbar" aria-label={label}
        aria-valuemin={0} aria-valuemax={limit} aria-valuenow={target}
        aria-valuetext={`${target} из ${limit}`}>
        <span className="motion-progress__fill" style={{ transform: `scaleX(${target / limit})` }} />
      </div>
    </div>
  );
}
