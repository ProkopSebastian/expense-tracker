import { useState } from "react";
import { Upload, RefreshCw, Undo2 } from "lucide-react";
import { request, useAction, useResource } from "../hooks";
import { Notice } from "../components/Forms";

export default function DataPage({
  revision,
  onChanged,
}: {
  revision: number;
  onChanged: () => void;
}) {
  const action = useAction(onChanged);
  const { data: recovery } = useResource<{ can_undo: boolean }>(
    "/recovery",
    revision,
  );
  const [apiKey, setApiKey] = useState("");
  const [account, setAccount] = useState("");
  const [message, setMessage] = useState("");
  async function upload(file?: File) {
    if (!file) return;
    await action.run(async () => {
      const params = account.trim()
        ? `?account=${encodeURIComponent(account.trim())}`
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
      <section className="balance-panel form-stack">
        <h2>Import transakcji</h2>
        <p className="form-help">
          Wybierz eksport CSV Nest lub Revolut. Operacje oczekujące uwzględniamy
          od razu. W Nest liczymy datę operacji.
        </p>
        <label>
          Nazwa rachunku (opcjonalnie)
          <input
            value={account}
            onChange={(e) => setAccount(e.target.value)}
            placeholder="Domyślnie: nest lub revolut"
            maxLength={80}
          />
        </label>
        <p className="form-help">
          Dla kilku rachunków w jednym banku używaj za każdym razem tej samej,
          osobnej nazwy.
        </p>
        <label
          className={`upload-zone ${action.busy ? "loading" : ""}`}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            if (!action.busy) void upload(e.dataTransfer.files[0]);
          }}
        >
          <Upload size={28} />
          <strong>Wybierz CSV lub przeciągnij go tutaj</strong>
          <span>Nest i Revolut · do 20 MB</span>
          <input
            type="file"
            accept=".csv,text/csv"
            disabled={action.busy}
            onChange={(e) => {
              void upload(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </label>
        <button
          className="button"
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
          <RefreshCw size={16} /> Importuj z lokalnego folderu danych
        </button>
      </section>
      <section className="balance-panel form-stack">
        <h2>Opcjonalna pomoc AI</h2>
        <p className="form-help">
          Własny klucz API jest przechowywany lokalnie. Analiza uruchamia się
          dopiero po użyciu przycisku AI; wtedy dane do analizy trafiają do
          dostawcy modelu.
        </p>
        <label>
          Klucz API
          <input
            type="password"
            autoComplete="off"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="Wklej nowy klucz"
          />
        </label>
        <div className="form-actions">
          <button
            className="button"
            disabled={action.busy || !apiKey.trim()}
            onClick={() =>
              action.run(async () => {
                await request("/settings/ai", "PUT", { api_key: apiKey });
                setApiKey("");
                setMessage("Klucz zapisany lokalnie.");
              })
            }
          >
            Zapisz klucz
          </button>
          <button
            className="button"
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
