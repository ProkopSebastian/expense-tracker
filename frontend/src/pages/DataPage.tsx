import { useState } from "react";
import { FolderOpen, RefreshCw, Undo2, Upload } from "lucide-react";
import { request, useAction, useResource } from "../hooks";
import { Notice } from "../components/Forms";
import AppSelect from "../components/AppSelect";

export default function DataPage({
  accounts,
  revision,
  onChanged,
}: {
  accounts: string[];
  revision: number;
  onChanged: () => void;
}) {
  const action = useAction(onChanged);
  const { data: recovery } = useResource<{
    can_undo: boolean;
    label: string | null;
  }>("/recovery", revision);
  const [account, setAccount] = useState("");
  const [newAccount, setNewAccount] = useState("");
  const [accountOptionsOpen, setAccountOptionsOpen] = useState(false);
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
        headers: { "X-File-Name": file.name },
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
    <div className="mx-auto max-w-3xl">
      <h1>Import danych</h1>
      <Notice error={action.error} notice={message || action.notice} />
      <section className="mt-8 border-t border-line pt-6">
        <h2>Wyciąg z banku</h2>
        <p className="mt-1 text-sm text-muted">
          Nest, Revolut i Erste — CSV · ING i Velo — PDF · maks. 20 MB
        </p>
        <label
          className={`mt-5 flex min-h-36 cursor-pointer flex-col items-center justify-center gap-4 rounded-lg border border-dashed border-accent/40 bg-accent-soft/30 px-5 py-6 text-center transition hover:border-accent/70 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent sm:flex-row sm:justify-between sm:text-left ${action.busy || !accountReady ? "opacity-60" : ""}`}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            if (!action.busy && accountReady)
              void upload(e.dataTransfer.files[0]);
          }}
        >
          <span className="flex flex-col items-center gap-3 sm:flex-row sm:text-left">
            <Upload className="shrink-0 text-accent" size={22} />
            <span>
              <strong className="block text-sm font-medium text-ink">
                Przeciągnij plik tutaj
              </strong>
              <span className="mt-1 block text-xs text-muted">CSV lub PDF</span>
            </span>
          </span>
          <span className="shrink-0 rounded-lg border border-line bg-surface px-4 py-2 text-sm font-medium text-ink">
            Wybierz plik
          </span>
          <input
            className="sr-only"
            type="file"
            accept=".csv,.pdf,text/csv,application/pdf"
            disabled={action.busy || !accountReady}
            onChange={(e) => {
              void upload(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </label>
        <details
          className="mt-5 text-sm text-muted"
          open={accountOptionsOpen}
          onToggle={(event) =>
            setAccountOptionsOpen((event.target as HTMLDetailsElement).open)
          }
        >
          <summary className="cursor-pointer select-none hover:text-accent">
            Wybierz rachunek ręcznie
          </summary>
          <div className="mt-4 max-w-sm space-y-4 border-l-2 border-line pl-4 [&_label]:flex [&_label]:flex-col [&_label]:gap-2 [&_label]:text-sm">
            <label>
              Przypisz import do rachunku
              <AppSelect
                ariaLabel="Przypisz import do rachunku"
                value={account}
                onValueChange={setAccount}
                options={[
                  { value: "", label: "Rozpoznaj automatycznie" },
                  ...accounts.map((name) => ({ value: name, label: name })),
                  { value: "__new__", label: "+ Dodaj nowy rachunek…" },
                ]}
              />
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
          </div>
        </details>
      </section>
      <section className="mt-8 border-t border-line pt-6">
        <h2>Folder danych</h2>
        <p className="mt-1 text-sm leading-relaxed text-muted">
          Wczytaj nowe eksporty zapisane w folderze data.
        </p>
        <div className="mt-5 flex flex-wrap items-center gap-2">
          <button
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-white transition hover:bg-accent-hover disabled:opacity-50"
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
            <RefreshCw size={16} /> Wczytaj nowe pliki
          </button>
          <button
            className="inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium text-muted transition hover:bg-accent-soft hover:text-accent"
            onClick={() =>
              fetch("/open-data-folder", { method: "POST" }).catch(() => {})
            }
          >
            <FolderOpen size={16} /> Otwórz folder danych
          </button>
        </div>
      </section>
      <div className="mt-8 border-t border-line pt-4">
        <button
          className="inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-muted transition hover:bg-accent-soft hover:text-accent disabled:cursor-not-allowed disabled:opacity-50"
          disabled={action.busy || !recovery?.can_undo}
          title={recovery?.label ?? "Brak zmian do cofnięcia"}
          onClick={() =>
            action.run(async () => {
              await request("/undo", "POST");
              setMessage("Ostatnia zmiana została cofnięta.");
            })
          }
        >
          <Undo2 size={16} /> Cofnij ostatnią zmianę
        </button>
      </div>
    </div>
  );
}
