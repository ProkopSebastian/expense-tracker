import { useCallback, useEffect, useRef, useState } from "react";

export interface UpdateStatus {
  enabled: boolean;
  token?: string;
  current_version: string;
  state?: "idle" | "checking" | "current" | "available" | "downloading" | "ready" | "installing" | "error";
  message?: string;
  automatic?: boolean;
  version?: string;
  notes?: string;
  downloaded?: number;
  size?: number;
  requires_authorization?: boolean;
  result?: { ok: boolean; message: string } | null;
}

export function useUpdates() {
  const [status, setStatus] = useState<UpdateStatus | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const latest = useRef(status);
  latest.current = status;
  const generation = useRef(0);

  useEffect(() => {
    let disposed = false;
    let polling = false;
    let refreshQueued = false;
    let timer: ReturnType<typeof setTimeout>;
    let pending: AbortController | null = null;
    const poll = async () => {
      if (disposed) return;
      if (polling) {
        refreshQueued = true;
        return;
      }
      polling = true;
      let keepPolling = true;
      try {
        if (document.visibilityState !== "hidden") {
          const revision = generation.current;
          const controller = new AbortController();
          pending = controller;
          const timeout = setTimeout(() => controller.abort(), 5000);
          try {
            const response = await fetch("/api/updates", { signal: controller.signal });
            if (response.ok) {
              const next: UpdateStatus = await response.json();
              if (!disposed && revision === generation.current) {
                latest.current = next;
                setStatus(next);
              }
              keepPolling = next.enabled;
            }
          } catch {
            // Closing the desktop server during installation is expected.
          } finally {
            clearTimeout(timeout);
            pending = null;
          }
        }
      } finally {
        polling = false;
        if (!disposed && keepPolling) {
          const active = document.visibilityState !== "hidden"
            && ["checking", "downloading", "installing"].includes(latest.current?.state ?? "");
          timer = setTimeout(poll, refreshQueued ? 0 : active ? 1000 : 60_000);
        }
        refreshQueued = false;
      }
    };
    void poll();
    const refresh = () => {
      clearTimeout(timer);
      void poll();
    };
    window.addEventListener("wydatki-update-refresh", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      disposed = true;
      pending?.abort();
      clearTimeout(timer);
      window.removeEventListener("wydatki-update-refresh", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);

  const act = useCallback(async (action: string, body?: unknown) => {
    setBusy(true);
    setError("");
    generation.current += 1;
    try {
      const response = await fetch(`/api/updates/${action}`, {
        method: action === "preferences" ? "PUT" : "POST",
        headers: { "Content-Type": "application/json", "X-Update-Token": latest.current?.token ?? "" },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail ?? "Nie udało się wykonać aktualizacji.");
      latest.current = data;
      setStatus(data);
      window.dispatchEvent(new Event("wydatki-update-refresh"));
    } catch (caught) {
      setError(caught instanceof Error && caught.name === "Error"
        ? caught.message : "Nie udało się połączyć z aplikacją. Spróbuj ponownie.");
    } finally {
      generation.current += 1;
      setBusy(false);
    }
  }, []);

  return { status, error, busy, act };
}

export type UpdateController = ReturnType<typeof useUpdates>;
