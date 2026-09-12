import { useState } from "react";
import {
  CheckCircle2,
  FolderOpen,
  KeyRound,
  RefreshCw,
  Undo2,
  Upload,
} from "lucide-react";
import { request, useAction, useResource } from "../hooks";
import { Notice } from "../components/Forms";

export default function DataPage({
  accounts,
  aiEnabled,
  revision,
  onChanged,
}: {
  accounts: string[];
  aiEnabled: boolean;
  revision: number;
  onChanged: () => void;
}) {
  const action = useAction(onChanged);
  const { data: recovery } = useResource<{
    can_undo: boolean;
    label: string | null;
  }>("/recovery", revision);
  const [apiKey, setApiKey] = useState("");
  const [account, setAccount] = useState("");
  const [newAccount, setNewAccount] = useState("");
  const [message, setMessage] = useState("");
  const accountReady = account !== "__new__" || Boolean(newAccount.trim());
  async function upload(file?: File) {
    if (!file || !accountReady) return;
    await action.run(async () => {
      const selectedAccount =
        account === "__new__" ? newAccount.trim() : account.trim();
      const params = selectedAccount
        ? `?account=${encodeURIComponent(selectedAccount)}`
        : "";
      const response = await fetch(`/api/import${params}`, {
        method: "POST",
        body: file,
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(
          typeof result.detail === "string"
            ? result.detail
            : "Nie udało się wczytać pliku.",
        );
      setMessage(result.message);
    });
  }
  return (
    <>
      <div className="mb-7 flex flex-wrap items-center justify-between gap-4 [&_p]:mt-2 [&_p]:text-sm [&_p]:leading-relaxed [&_p]:text-muted">
        <div>
          <h1>Dane i ustawienia</h1>
          <p>
            Twoje pliki, rachunki i bezpieczny powrót do poprzedniego stanu.
          </p>
        </div>
      </div>
      <Notice error={action.error} notice={message || action.notice} />
      <section className="my-6 flex flex-col gap-4 rounded-2xl border border-accent/20 bg-gradient-to-br from-accent-soft to-surface p-6 shadow-sm lg:flex-row lg:items-center">
        <div
          className="grid size-12 shrink-0 place-items-center rounded-2xl bg-surface text-accent shadow-sm"
          aria-hidden="true"
        >
          <RefreshCw size={22} />
        </div>
        <div className="flex flex-1 flex-col gap-1 [&_p]:text-sm [&_p]:leading-relaxed [&_p]:text-muted">
          <h2>Aktualizuj dane z folderu data</h2>
          <p>
            Wczytaj wszystkie nowe eksporty Nest i Revolut umieszczone w
            lokalnym folderze projektu.
          </p>
        </div>
        <button
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-line bg-surface px-4 py-2.5 text-sm font-medium shadow-sm transition hover:border-accent/30 hover:bg-accent-soft border-accent! bg-accent! text-white! shadow-accent/15 hover:bg-accent-hover!"
          disabled={action.busy}
          onClick={() =>
            action.run(async () => {
              const result = await request<{
                transactions_inserted: number;
                error_files: [string, string][];
                unsupported_files: string[];
              }>("/sync", "POST");
              setMessage(
                `Nowe transakcje: ${result.transactions_inserted}. ${result.error_files.map(([f, e]) => `${f}: ${e}`).join(" ")} ${result.unsupported_files.map((f) => `Nieobsługiwany format: ${f}`).join(" ")}`,
              );
            })
          }
        >
          <RefreshCw size={16} /> Aktualizuj teraz
        </button>
        <button
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-line bg-surface px-4 py-2.5 text-sm font-medium shadow-sm transition hover:border-accent/30 hover:bg-accent-soft"
          onClick={() =>
            fetch("/open-data-folder", { method: "POST" }).catch(() => {})
          }
        >
          <FolderOpen size={16} /> Otwórz folder danych
        </button>
      </section>
      <section className="my-6 rounded-2xl border border-line bg-surface p-5 shadow-sm lg:p-6 flex flex-col gap-5 p-5 sm:p-6 [&>p]:text-sm [&>p]:leading-relaxed [&_label]:flex [&_label]:flex-col [&_label]:gap-2 [&_label]:text-sm [&_label_small]:text-xs [&_label_small]:text-muted [&_summary]:cursor-pointer [&_summary]:text-sm [&_details_label]:mt-3">
        <h2>Wczytaj pojedynczy plik CSV</h2>
        <p className="text-sm leading-relaxed text-muted">
          Wybierz eksport CSV Nest lub Revolut. Operacje oczekujące uwzględniamy
          od razu. W Nest liczymy datę operacji.
        </p>
        <label>
          Przypisz do rachunku
          <select value={account} onChange={(e) => setAccount(e.target.value)}>
            <option value="">Rozpoznaj automatycznie (Nest lub Revolut)</option>
            {accounts.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
            <option value="__new__">+ Dodaj nowy rachunek…</option>
          </select>
        </label>
        {account === "__new__" && (
          <label>
            Nazwa nowego rachunku
            <input
              value={newAccount}
              onChange={(e) => setNewAccount(e.target.value)}
              placeholder="Na przykład: Nest oszczędnościowe"
              maxLength={80}
              required
            />
          </label>
        )}
        <p className="text-sm leading-relaxed text-muted">
          Plik zostanie zaimportowany bez kopiowania do folderu data. Przy
          kolejnych importach wybierz ten sam rachunek z listy.
        </p>
        <label
          className={`flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-accent/40 bg-accent-soft/50 p-7 text-center text-accent [&_input]:max-w-full ${action.busy || !accountReady ? "opacity-60" : ""}`}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            if (!action.busy && accountReady)
              void upload(e.dataTransfer.files[0]);
          }}
        >
          <Upload size={28} />
          <strong>Wybierz CSV lub przeciągnij go tutaj</strong>
          <span>Nest i Revolut · do 20 MB</span>
          <input
            type="file"
            accept=".csv,text/csv"
            disabled={action.busy || !accountReady}
            onChange={(e) => {
              void upload(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </label>
      </section>
      <section className="my-6 rounded-2xl border border-line bg-surface p-5 shadow-sm lg:p-6 flex flex-col gap-5 p-5 sm:p-6 [&>p]:text-sm [&>p]:leading-relaxed [&_label]:flex [&_label]:flex-col [&_label]:gap-2 [&_label]:text-sm [&_label_small]:text-xs [&_label_small]:text-muted [&_summary]:cursor-pointer [&_summary]:text-sm [&_details_label]:mt-3">
        <h2>Opcjonalna pomoc AI</h2>
        {aiEnabled ? (
          <div className="flex flex-col justify-between gap-4 rounded-xl border border-success/25 bg-success/10 p-4 sm:flex-row sm:items-center">
            <div className="flex items-center gap-3 text-success [&_svg]:shrink-0 [&>div]:flex [&>div]:flex-col [&>div]:gap-1 [&_strong]:text-sm [&_span]:text-xs [&_span]:leading-relaxed [&_span]:text-muted">
              <CheckCircle2 size={20} />
              <div>
                <strong>Klucz API jest zapisany</strong>
                <span>Analiza AI jest dostępna w zakładce klasyfikacji.</span>
              </div>
            </div>
            <button
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-line bg-surface px-4 py-2.5 text-sm font-medium shadow-sm transition hover:border-accent/30 hover:bg-accent-soft border-danger/25! bg-danger/10! text-danger! hover:bg-danger/15!"
              disabled={action.busy}
              onClick={() =>
                action.run(async () => {
                  await request("/settings/ai", "PUT", { clear_key: true });
                  setApiKey("");
                  setMessage("Klucz usunięty.");
                })
              }
            >
              Usuń klucz
            </button>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-3 text-success [&_svg]:shrink-0 [&>div]:flex [&>div]:flex-col [&>div]:gap-1 [&_strong]:text-sm [&_span]:text-xs [&_span]:leading-relaxed [&_span]:text-muted items-start! rounded-xl bg-surface-muted p-4 text-muted!">
              <KeyRound size={20} />
              <div>
                <strong>Klucz API nie jest jeszcze dodany</strong>
                <span>
                  Jest przechowywany lokalnie. Dane trafiają do dostawcy modelu
                  dopiero po ręcznym uruchomieniu analizy.
                </span>
              </div>
            </div>
            <label>
              Klucz API
              <input
                type="password"
                autoComplete="off"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="Wklej klucz API"
              />
            </label>
            <div className="flex flex-wrap justify-end gap-2 border-t border-line pt-5">
              <button
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-line bg-surface px-4 py-2.5 text-sm font-medium shadow-sm transition hover:border-accent/30 hover:bg-accent-soft border-accent! bg-accent! text-white! shadow-accent/15 hover:bg-accent-hover!"
                disabled={action.busy || !apiKey.trim()}
                onClick={() =>
                  action.run(async () => {
                    await request("/settings/ai", "PUT", {
                      api_key: apiKey,
                    });
                    setApiKey("");
                    setMessage("Klucz zapisany lokalnie.");
                  })
                }
              >
                Dodaj klucz
              </button>
            </div>
          </>
        )}
      </section>
      <section className="my-6 rounded-2xl border border-line bg-surface p-5 shadow-sm lg:p-6 flex flex-col gap-5 p-5 sm:p-6 [&>p]:text-sm [&>p]:leading-relaxed [&_label]:flex [&_label]:flex-col [&_label]:gap-2 [&_label]:text-sm [&_label_small]:text-xs [&_label_small]:text-muted [&_summary]:cursor-pointer [&_summary]:text-sm [&_details_label]:mt-3">
        <h2>Ochrona danych</h2>
        <p className="text-sm leading-relaxed text-muted">
          Kopia bazy powstaje przed zmianami i przy pierwszym uruchomieniu
          każdego dnia. Zachowujemy 30 ostatnich kopii każdego rodzaju obok
          bazy, w folderze z końcówką „backups”.
        </p>
        <p className="text-sm leading-relaxed text-muted">
          Cofnięcie przywraca stan sprzed ostatniej operacji, także importu lub
          grupowania. Późniejsze zmiany wykonane poza aplikacją blokują
          cofnięcie.
        </p>
        {recovery?.can_undo && recovery.label && (
          <p className="text-sm leading-relaxed text-muted">
            Ostatnia zmiana do cofnięcia: <strong>{recovery.label}</strong>
          </p>
        )}
        <button
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-line bg-surface px-4 py-2.5 text-sm font-medium shadow-sm transition hover:border-accent/30 hover:bg-accent-soft"
          disabled={action.busy || !recovery?.can_undo}
          onClick={() =>
            action.run(async () => {
              await request("/undo", "POST");
              setMessage("Ostatnia zmiana została cofnięta.");
            })
          }
        >
          <Undo2 size={16} /> Cofnij ostatnią zmianę
        </button>
      </section>
    </>
  );
}
