import {
  useEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type ReactNode,
} from "react";
import { Link } from "react-router-dom";
import type { Task } from "../../domain/models";

type Variant = "primary" | "secondary" | "quiet" | "danger";
export function Button({
  variant = "primary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button {...props} className={`button button--${variant} ${className}`} />
  );
}
export function ActionLink({
  to,
  children,
  variant = "secondary",
  className = "",
}: {
  to: string;
  children: ReactNode;
  variant?: Variant;
  className?: string;
}) {
  return (
    <Link to={to} className={`button button--${variant} ${className}`}>
      {children}
    </Link>
  );
}
export function PageTrail({
  title,
  to = "/business/tasks",
  label = "К моим задачам",
}: {
  title: string;
  to?: string;
  label?: string;
}) {
  return (
    <nav className="page-trail" aria-label="Путь страницы">
      <Link to={to}>← {label}</Link>
      <span aria-hidden="true">/</span>
      <span>{title}</span>
    </nav>
  );
}
export function TaskStatus({
  task,
  selected = false,
}: {
  task: Task;
  selected?: boolean;
}) {
  const draft = task.publicationStatus === "draft";
  const label = draft
    ? "Черновик"
    : task.publicationStatus === "archived"
      ? "В архиве"
      : selected
        ? "Команда выбрана"
        : "Опубликована";
  return (
    <span className={`status ${draft ? "status--pending" : "status--success"}`}>
      <span aria-hidden="true">●</span> {label}
    </span>
  );
}
export function ErrorMessage({ message }: { message: string | null }) {
  return message ? (
    <p className="error-message" role="alert">
      {message}
    </p>
  ) : null;
}
export function EmptyState({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="panel empty-state">
      <span className="empty-symbol" aria-hidden="true">
        ☰
      </span>
      <h2>{title}</h2>
      {children}
    </section>
  );
}
export function useAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const mounted = useRef(true);
  const running = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      clearTimeout(timer.current);
    };
  }, []);
  const confirm = (text: string) => {
    setMessage(text);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      if (mounted.current) setMessage(null);
    }, 2000);
  };
  const run = async (action: () => Promise<void>) => {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (e) {
      if (mounted.current)
        setError(
          e instanceof Error
            ? e.message
            : "Не удалось сохранить. Попробуйте ещё раз.",
        );
    } finally {
      running.current = false;
      if (mounted.current) setBusy(false);
    }
  };
  return { busy, error, message, confirm, run };
}
