import { useRef, useState } from "react";
import { CheckCircle2, Download, KeyRound, LoaderCircle, RefreshCw, ShieldCheck, Upload } from "lucide-react";
import { dayLabel } from "../api";
import { request } from "../hooks";

type DataSummary = { transactions: number; last_transaction: string | null; files: number };
type BackupCheck = {
  backup: { created_at: string; app_version: string; contents: DataSummary };
  current: DataSummary;
};

const SUMMARY_ROWS: { label: string; value: (summary: DataSummary) => string }[] = [
  { label: "Transakcje", value: (summary) => String(summary.transactions) },
  {
    label: "Najnowsza transakcja",
    value: (summary) => (summary.last_transaction ? dayLabel(summary.last_transaction) : "—"),
  },
  { label: "Pliki w folderze danych", value: (summary) => String(summary.files) },
];

async function sendBackup<T>(path: string, file: File): Promise<T> {
  const response = await fetch(`/api${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/zip" },
    body: file,
  }).catch(() => {
    throw new Error("Brak połączenia z aplikacją. Spróbuj ponownie za chwilę.");
  });
  const result = await response.json().catch(() => null);
  if (!response.ok)
    throw new Error(typeof result?.detail === "string" ? result.detail : "Nie udało się odczytać kopii.");
  return result as T;
}

export default function BackupPanel({
  onRestored,
  onBusyChange,
}: {
  onRestored: () => void;
  onBusyChange: (busy: boolean) => void;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<"idle" | "saving" | "checking" | "confirm" | "restoring">("idle");
  const [file, setFile] = useState<File | null>(null);
  const [info, setInfo] = useState<BackupCheck | null>(null);
  const [result, setResult] = useState("");
  const [error, setError] = useState("");
  const working = step === "saving" || step === "checking" || step === "restoring";

  function begin(next: typeof step) {
    setStep(next);
    setError("");
    setResult("");
    onBusyChange(next === "restoring");
  }
  function fail(caught: unknown, fallback: string) {
    setError(caught instanceof Error ? caught.message : fallback);
    setStep("idle");
    onBusyChange(false);
  }

  async function save() {
    begin("saving");
    try {
      const outcome = await request<{ status: string; path?: string; url?: string }>("/backup/export", "POST");
      if (outcome.status === "download" && outcome.url) window.location.assign(outcome.url);
      if (outcome.status === "saved") setResult(`Kopia zapisana: ${outcome.path}`);
      setStep("idle");
    } catch (caught) {
      fail(caught, "Nie udało się zapisać kopii.");
    }
  }

  async function check(chosen: File | undefined) {
    if (!chosen) return;
    begin("checking");
    setFile(chosen);
    try {
      setInfo(await sendBackup<BackupCheck>("/backup/inspect", chosen));
      setStep("confirm");
    } catch (caught) {
      fail(caught, "Nie udało się odczytać kopii.");
    }
  }

  async function restore() {
    if (!file) return;
    begin("restoring");
    try {
      const outcome = await sendBackup<{ safety_copy: string }>("/backup/restore", file);
      setResult(`Dane przywrócone z kopii. Poprzedni stan zapisano w pliku: ${outcome.safety_copy}`);
      setStep("idle");
      onBusyChange(false);
      onRestored();
    } catch (caught) {
      fail(caught, "Nie udało się przywrócić danych.");
    }
  }

  const createdAt = info?.backup.created_at
    ? new Date(info.backup.created_at).toLocaleString("pl-PL", { dateStyle: "short", timeStyle: "short" })
    : "?";
  return (
    <section aria-labelledby="backup-heading" className="space-y-3">
      <h2 id="backup-heading" className="text-base!">
        Kopia zapasowa
      </h2>
      <p className="text-sm leading-relaxed text-muted">
        Jeden plik z całą historią, wyciągami z folderu danych i motywem, bez klucza API. Warto trzymać go
        poza komputerem, np. na dysku zewnętrznym.
      </p>
      <div className="flex flex-wrap gap-2">
        <button className="btn" disabled={working || step === "confirm"} onClick={() => void save()}>
          {step === "saving" ? (
            <LoaderCircle size={16} className="animate-spin motion-reduce:animate-none" />
          ) : (
            <Download size={16} />
          )}
          Zapisz kopię…
        </button>
        <button
          className="btn"
          disabled={working || step === "confirm"}
          onClick={() => fileInput.current?.click()}
        >
          {step === "checking" ? (
            <LoaderCircle size={16} className="animate-spin motion-reduce:animate-none" />
          ) : (
            <Upload size={16} />
          )}
          Wczytaj kopię…
        </button>
        <input
          ref={fileInput}
          type="file"
          accept=".zip,application/zip"
          className="hidden"
          onChange={(event) => {
            void check(event.target.files?.[0]);
            event.target.value = "";
          }}
        />
      </div>
      {error && (
        <p role="alert" className="text-sm leading-relaxed text-danger">
          {error}
        </p>
      )}
      {result && (
        <p className="flex items-start gap-2 text-sm leading-relaxed wrap-anywhere text-success">
          <CheckCircle2 size={17} className="mt-0.5 shrink-0" />
          {result}
        </p>
      )}
      {(step === "confirm" || step === "restoring") && info && (
        <div className="space-y-4 rounded-xl border border-warning/40 bg-warning/5 p-4">
          <h3 className="text-sm font-semibold">Zastąpić obecne dane danymi z kopii?</h3>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted [&>th]:pb-1.5 [&>th]:font-normal">
                <th />
                <th className="text-right">Teraz</th>
                <th className="text-right">Kopia z {createdAt}</th>
              </tr>
            </thead>
            <tbody className="[&_td]:py-1 [&_td:not(:first-child)]:text-right [&_td:not(:first-child)]:tabular-nums">
              {SUMMARY_ROWS.map((row) => {
                const now = row.value(info.current),
                  restored = row.value(info.backup.contents);
                return (
                  <tr key={row.label}>
                    <td className="text-muted">{row.label}</td>
                    <td>{now}</td>
                    <td className={restored === now ? "" : "font-semibold"}>{restored}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <ul className="space-y-2 text-sm leading-relaxed text-muted [&_li]:flex [&_li]:gap-2.5 [&_svg]:mt-0.5 [&_svg]:shrink-0">
            <li>
              <RefreshCw size={16} className="text-warning" />
              <span>
                Transakcje, kategorie, reguły, grupy, gotówka, majątek, pliki z folderu danych i motyw zostaną
                zastąpione tymi z kopii.
              </span>
            </li>
            <li>
              <KeyRound size={16} />
              <span>Klucz API zostanie bez zmian.</span>
            </li>
            <li>
              <ShieldCheck size={16} className="text-success" />
              <span>
                Najpierw obecne dane zapiszą się jako osobny plik kopii. Wczytanie go tutaj przywróci dzisiejszy
                stan; zwykłe „Cofnij” tego nie zrobi.
              </span>
            </li>
          </ul>
          {info.backup.app_version && (
            <p className="text-xs text-muted">
              Kopię zrobiono w Wydatkach {info.backup.app_version}.
            </p>
          )}
          <div className="flex flex-wrap justify-end gap-2">
            <button
              className="btn"
              disabled={step === "restoring"}
              onClick={() => {
                setStep("idle");
                setInfo(null);
                setFile(null);
              }}
            >
              Anuluj
            </button>
            <button className="btn-primary" disabled={step === "restoring"} onClick={() => void restore()}>
              {step === "restoring" ? "Zastępowanie…" : "Zastąp obecne dane"}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
