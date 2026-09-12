import { useState } from "react";
import { CheckCircle2, FolderOpen, KeyRound, RefreshCw, Undo2, Upload } from "lucide-react";
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
      <div className="page-heading">
        <div>
          <h1>Dane i ustawienia</h1>
          <p>
            Twoje pliki, rachunki i bezpieczny powrót do poprzedniego stanu.
          </p>
        </div>
      </div>
      <Notice error={action.error} notice={message || action.notice} />
      <section className="folder-sync-panel">
        <div className="folder-sync-icon" aria-hidden="true">
          <RefreshCw size={22} />
        </div>
        <div className="folder-sync-copy">
          <h2>Aktualizuj dane z folderu data</h2>
          <p>
            Wczytaj wszystkie nowe eksporty Nest i Revolut umieszczone w
            lokalnym folderze projektu.
          </p>
        </div>
        <button
          className="button primary-button"
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
          className="button"
          onClick={() => fetch("/open-data-folder", { method: "POST" }).catch(() => {})}
        >
          <FolderOpen size={16} /> Otwórz folder danych
        </button>
      </section>
      <section className="balance-panel form-stack">
        <h2>Wczytaj pojedynczy plik CSV</h2>
        <p className="form-help">
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
        <p className="form-help">
          Plik zostanie zaimportowany bez kopiowania do folderu data. Przy
          kolejnych importach wybierz ten sam rachunek z listy.
        </p>
        <label
          className={`upload-zone ${action.busy || !accountReady ? "loading" : ""}`}
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
      <section className="balance-panel form-stack">
        <h2>Opcjonalna pomoc AI</h2>
        {aiEnabled ? (
          <div className="api-key-state">
            <div className="api-key-status">
              <CheckCircle2 size={20} />
              <div>
                <strong>Klucz API jest zapisany</strong>
                <span>Analiza AI jest dostępna w zakładce klasyfikacji.</span>
              </div>
            </div>
            <button
              className="button danger-button"
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
            <div className="api-key-status missing">
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
            <div className="form-actions">
              <button
                className="button primary-button"
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
      <section className="balance-panel form-stack">
        <h2>Ochrona danych</h2>
        <p className="form-help">
          Kopia bazy powstaje przed zmianami i przy pierwszym uruchomieniu
          każdego dnia. Zachowujemy 30 ostatnich kopii każdego rodzaju obok
          bazy, w folderze z końcówką „backups”.
        </p>
        <p className="form-help">
          Cofnięcie przywraca stan sprzed ostatniej operacji, także importu lub
          grupowania. Późniejsze zmiany wykonane poza aplikacją blokują
          cofnięcie.
        </p>
        {recovery?.can_undo && recovery.label && (
          <p className="form-help">
            Ostatnia zmiana do cofnięcia: <strong>{recovery.label}</strong>
          </p>
        )}
        <button
          className="button"
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
