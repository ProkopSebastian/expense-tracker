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
    <>
      <div className="mb-6 [&_p]:mt-1 [&_p]:text-sm [&_p]:text-muted">
        <div>
          <h1>Import danych</h1>
          <p>Dodaj wyciąg lub wczytaj pliki z folderu data.</p>
        </div>
      </div>
      <Notice error={action.error} notice={message || action.notice} />
      <div className="my-5 grid max-w-5xl gap-5 lg:grid-cols-[minmax(0,1.3fr)_minmax(320px,0.7fr)]">
        <section className="flex flex-col gap-5 rounded-2xl border border-line bg-surface p-5 shadow-sm sm:p-6 [&_label]:flex [&_label]:flex-col [&_label]:gap-2 [&_label]:text-sm">
          <div>
            <h2>Wczytaj wyciąg</h2>
            <p className="mt-1 text-sm leading-relaxed text-muted">
              Nest, Revolut i Erste — CSV · ING i Velo — PDF · maks. 20 MB
            </p>
          </div>
          <label
            className={`flex min-h-44 cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-accent/40 bg-accent-soft/50 p-5 text-center text-accent ${action.busy || !accountReady ? "opacity-60" : ""}`}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              if (!action.busy && accountReady)
                void upload(e.dataTransfer.files[0]);
            }}
          >
            <Upload size={24} />
            <strong>Przeciągnij plik tutaj</strong>
            <span className="text-sm text-muted">albo</span>
            <span className="rounded-lg bg-surface px-3 py-2 text-sm font-medium shadow-sm">
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
            className="text-sm text-muted"
            open={accountOptionsOpen}
            onToggle={(event) =>
              setAccountOptionsOpen((event.target as HTMLDetailsElement).open)
            }
          >
            <summary className="cursor-pointer select-none hover:text-accent">
              Inny rachunek
            </summary>
            <div className="mt-3 border-l-2 border-line pl-4">
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
                <label className="mt-3">
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
        <section className="flex flex-col rounded-2xl border border-line bg-surface p-5 shadow-sm sm:p-6">
          <span className="mb-4 grid size-10 place-items-center rounded-xl bg-accent-soft text-accent">
            <RefreshCw size={20} />
          </span>
          <div>
            <h2>Folder danych</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              Wczytaj wszystkie nowe eksporty zapisane w folderze data.
            </p>
          </div>
          <div className="mt-5 flex flex-col gap-2">
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
              <RefreshCw size={16} /> Wczytaj nowe pliki
            </button>
            <button
              className="inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium text-muted transition hover:bg-accent-soft hover:text-accent"
              onClick={() =>
                fetch("/open-data-folder", { method: "POST" }).catch(() => {})
              }
            >
              <FolderOpen size={16} /> Otwórz folder danych
            </button>
            <div className="mt-2 border-t border-line pt-3">
              <button
                className="inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium text-muted transition hover:bg-accent-soft hover:text-accent disabled:cursor-not-allowed disabled:opacity-50"
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
        </section>
      </div>
    </>
  );
}
