import { useCallback, useEffect, useRef, useState } from "react";
import { createBackendClient, type ServerUser } from "../../data/backendClient";
import {
  emptyRemoteWorkspace,
  readWorkspace,
} from "../../data/serverWorkspace";

type Lifetime = { key: string; controller: AbortController };
type Mutation = { lifetime: Lifetime };
const canceled = () =>
  new DOMException("Операция отменена при переходе.", "AbortError");

export function useRemoteWorkspace(
  address: string,
  user: ServerUser,
  taskId?: number,
  page = "",
) {
  const [data, setData] = useState(emptyRemoteWorkspace);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pollExpired, setPollExpired] = useState(false);
  const [pollRun, setPollRun] = useState(0);
  const generation = useRef(0);
  const readController = useRef<AbortController | null>(null);
  const lifetime = useRef<Lifetime | null>(null);
  const mutationRunning = useRef<Mutation | null>(null);
  const contextKey = JSON.stringify([
    address,
    user.id,
    user.role,
    taskId,
    page,
  ]);
  const refresh = useCallback(
    async (silent = false) => {
      readController.current?.abort();
      const read = new AbortController();
      readController.current = read;
      const current = ++generation.current;
      if (!silent) setLoading(true);
      try {
        const next = await readWorkspace(address, user, taskId, read.signal);
        if (!read.signal.aborted && current === generation.current) {
          setData(next);
          setError(null);
        }
      } catch (cause) {
        if (read.signal.aborted) return;
        throw cause;
      } finally {
        if (!read.signal.aborted && current === generation.current)
          setLoading(false);
      }
    },
    [address, user.id, user.role, taskId, page],
  );
  useEffect(() => {
    const current = { key: contextKey, controller: new AbortController() };
    lifetime.current = current;
    mutationRunning.current = null;
    setBusy(false);
    setPollExpired(false);
    setMessage(null);
    setError(null);
    setData(emptyRemoteWorkspace());
    void refresh().catch((cause) => {
      if (!current.controller.signal.aborted)
        setError(
          cause instanceof Error
            ? cause.message
            : "Не удалось загрузить данные.",
        );
    });
    return () => {
      current.controller.abort();
      readController.current?.abort();
    };
  }, [refresh, contextKey]);
  const task = data.task;
  const waiting =
    !!task &&
    task.owner_id === user.id &&
    ["pending", "running"].includes(task.ai_status);
  useEffect(() => {
    if (!waiting || !task) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const deadline = Date.now() + 180000;
    setPollExpired(false);
    const api = createBackendClient(address, user.id, controller.signal);
    const poll = async () => {
      try {
        const updated = await api<typeof task>(`/tasks/${task.id}`);
        if (controller.signal.aborted) return;
        if (!["pending", "running"].includes(updated.ai_status)) {
          await refresh(true);
          return;
        }
        if (Date.now() > deadline) {
          setPollExpired(true);
          return;
        }
        timer = setTimeout(poll, 1800);
      } catch (cause) {
        if (!controller.signal.aborted)
          setError(
            cause instanceof Error
              ? cause.message
              : "Не удалось получить результат обработки.",
          );
      }
    };
    timer = setTimeout(poll, 900);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [address, user.id, task?.id, task?.revision, waiting, refresh, pollRun]);
  const request = async <T>(path: string, method = "POST", body?: unknown) => {
    const current = lifetime.current;
    if (
      !current ||
      current.key !== contextKey ||
      current.controller.signal.aborted
    )
      throw canceled();
    if (mutationRunning.current)
      throw new Error("Дождитесь сохранения предыдущего действия.");
    const operation = { lifetime: current };
    mutationRunning.current = operation;
    setBusy(true);
    setError(null);
    setMessage(null);
    const signal = current.controller.signal;
    try {
      const result = await createBackendClient(address, user.id, signal)<T>(
        path,
        method,
        body,
      );
      if (signal.aborted) throw canceled();
      // A committed mutation remains successful if its follow-up read fails. It must not be resubmitted.
      await refresh(true).catch(() => {
        if (!signal.aborted)
          setError(
            "Действие сохранено. Обновите страницу, чтобы получить актуальные данные.",
          );
      });
      if (signal.aborted) throw canceled();
      setMessage("Изменения сохранены");
      return result;
    } catch (cause) {
      if (!signal.aborted)
        setError(
          cause instanceof Error ? cause.message : "Не удалось сохранить.",
        );
      throw cause;
    } finally {
      // A request from the previous screen must never release the new screen's lock.
      if (mutationRunning.current === operation) {
        mutationRunning.current = null;
        if (!signal.aborted) setBusy(false);
      }
    }
  };
  const reload = () => {
    const current = lifetime.current;
    setPollRun((run) => run + 1);
    void refresh(true).catch((cause) => {
      if (current && !current.controller.signal.aborted)
        setError(
          cause instanceof Error
            ? cause.message
            : "Не удалось загрузить данные.",
        );
    });
  };
  return {
    data,
    loading,
    busy,
    error,
    message,
    waiting: waiting && !pollExpired,
    pollExpired,
    request,
    reload,
  };
}
