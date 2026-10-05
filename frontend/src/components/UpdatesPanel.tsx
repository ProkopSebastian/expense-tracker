import { Download, RefreshCw } from "lucide-react";
import type { UpdateController } from "../updates";

export default function UpdatesPanel({ updates }: { updates: UpdateController }) {
  const { status, error, busy, act } = updates;
  if (!status) return null;
  const working = ["checking", "downloading", "installing"].includes(status.state ?? "");
  const progress = status.size ? Math.min(100, Math.floor(100 * (status.downloaded ?? 0) / status.size)) : 0;
  return (
    <section aria-labelledby="updates-heading" className="space-y-3 rounded-xl border border-line p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="updates-heading" className="text-base!">Aktualizacje</h2>
        <span className="text-sm text-muted">Wersja {status.current_version}</span>
      </div>
      {!status.enabled ? (
        <p className="text-sm text-muted">Aktualizacje są dostępne w zainstalowanej aplikacji desktopowej.</p>
      ) : (
        <>
          <div aria-live="polite" className="space-y-2 text-sm">
            {status.state === "current" && <p>Masz najnowszą wersję.</p>}
            {status.state === "checking" && <p>Sprawdzanie aktualizacji…</p>}
            {status.version && !["current", "checking"].includes(status.state ?? "") && (
              <p className="font-medium">Dostępna wersja: {status.version}</p>
            )}
            {status.state === "downloading" && (
              <>
                <p>Pobieranie aktualizacji… {progress}%</p>
                <progress value={status.downloaded ?? 0} max={status.size ?? 1} className="h-2 w-full accent-accent" aria-label="Postęp pobierania" />
                <p className="text-muted">Możesz dalej korzystać z aplikacji.</p>
              </>
            )}
            {status.state === "ready" && (
              <p>Aktualizacja gotowa. Przed instalacją zapisz swoją pracę. Aplikacja utworzy kopię bazy i uruchomi się ponownie.</p>
            )}
            {status.state === "installing" && <p>Trwa instalacja. Zaczekaj na ponowne uruchomienie aplikacji.</p>}
            {status.requires_authorization && status.state === "ready" && (
              <p className="text-muted">System może poprosić o hasło administratora.</p>
            )}
            {(error || status.message) && <p role="alert" className="text-danger">{error || status.message}</p>}
            {status.result && !working && !status.version && <p className="text-muted">{status.result.message}</p>}
          </div>
          {status.notes && (
            <details className="text-sm">
              <summary className="cursor-pointer text-accent">Zmiany w nowej wersji</summary>
              <p className="mt-2 whitespace-pre-line text-muted">{status.notes}</p>
            </details>
          )}
          <div className="flex flex-wrap gap-2">
            {!working && status.state !== "ready" && (
              <button type="button" className="btn" disabled={busy} onClick={() => void act("check")}>
                <RefreshCw size={16} /> Sprawdź aktualizacje
              </button>
            )}
            {(status.state === "available" || (status.state === "error" && status.version)) && (
              <button type="button" className="btn-primary" disabled={busy} onClick={() => void act("download")}>
                <Download size={16} /> Pobierz aktualizację
              </button>
            )}
            {status.state === "downloading" && (
              <button type="button" className="btn" disabled={busy} onClick={() => void act("cancel")}>Anuluj pobieranie</button>
            )}
            {status.state === "ready" && (
              <button type="button" className="btn-primary" disabled={busy} onClick={() => void act("install")}>
                Zainstaluj i uruchom ponownie
              </button>
            )}
          </div>
          <label className="flex items-start gap-2 text-sm text-muted">
            <input
              type="checkbox"
              className="mt-1 accent-accent"
              checked={status.automatic ?? true}
              disabled={busy || status.state === "installing"}
              onChange={(event) => void act("preferences", { automatic: event.target.checked })}
            />
            Sprawdzaj dostępność w tle, najwyżej raz dziennie. Pobieranie i instalacja zawsze po kliknięciu.
          </label>
        </>
      )}
    </section>
  );
}
