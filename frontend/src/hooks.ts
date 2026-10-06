import { useCallback, useEffect, useState } from "react";
export async function request<T>(
  path: string,
  method = "GET",
  body?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const response = await fetch(`/api${path}`, {
    method,
    signal,
    headers: body === undefined ? {} : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok)
    throw new Error(
      typeof data?.detail === "string"
        ? data.detail
        : "Sprawdź dane formularza i spróbuj ponownie.",
    );
  return data as T;
}
export function useResource<T>(path: string | null, revision = 0) {
  const [data, setData] = useState<T | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true);
  useEffect(() => {
    if (path === null) {
      setData(null);
      setError("");
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    setError("");
    request<T>(path, "GET", undefined, controller.signal)
      .then((value) => {
        if (!controller.signal.aborted) setData(value);
      })
      .catch((error) => {
        if (!controller.signal.aborted) setError(error.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [path, revision]);
  return { data, error, loading };
}
export function useAction(onSuccess?: () => void) {
  const [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(""),
    [error, setError] = useState(""),
    [undoLabel, setUndoLabel] = useState<string | null>(null);
  async function run(
    action: () => Promise<unknown>,
    message = "Zmiany zapisane.",
  ) {
    setBusy(true);
    setError("");
    setNotice("");
    setUndoLabel(null);
    try {
      await action();
      setNotice(message);
      const recovery = await request<{ can_undo: boolean; label: string | null }>(
        "/recovery",
      ).catch(() => null);
      if (recovery?.can_undo) setUndoLabel(recovery.label ?? "ostatnią zmianę");
      onSuccess?.();
      return true;
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Nie udało się zapisać zmian.",
      );
      return false;
    } finally {
      setBusy(false);
    }
  }
  // Restores the backup taken before the last data-writing request, whatever made it.
  const undo = async () => {
    await run(() => request("/undo", "POST"), "Ostatnia zmiana została cofnięta.");
    setUndoLabel(null);
  };
  return { busy, notice, error, run, undo, undoLabel };
}

export function useLoadMoreSentinel(onReachEnd: () => void, enabled: boolean) {
  return useCallback(
    (node: Element | null) => {
      if (!node || !enabled) return;
      const observer = new IntersectionObserver(
        ([entry]) => entry.isIntersecting && onReachEnd(),
        { rootMargin: "200px" },
      );
      observer.observe(node);
      return () => observer.disconnect();
    },
    [onReachEnd, enabled],
  );
}

/** Keep view filters while navigating, without persisting transaction data. */
export function useSessionState<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const saved = sessionStorage.getItem(key);
      return saved === null ? initial : (JSON.parse(saved) as T);
    } catch {
      return initial;
    }
  });
  useEffect(() => {
    try {
      sessionStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* Storage is optional. */
    }
  }, [key, value]);
  return [value, setValue] as const;
}
