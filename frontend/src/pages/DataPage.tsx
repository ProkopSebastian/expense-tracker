import { useState } from "react";
import { importStatement, type ImportReceipt } from "../importStatement";
import { openLedger } from "../ledgerLink";
import * as Popover from "@radix-ui/react-popover";
import { ChevronDown, FolderOpen, RefreshCw, Upload } from "lucide-react";
import { request, useAction, useResource } from "../hooks";
import { Notice } from "../components/Forms";
import AppSelect from "../components/AppSelect";
import HelpPopover from "../components/HelpPopover";

const dateLabel = (value: string) => value.split("-").reverse().join(".");
const pluralRules = new Intl.PluralRules("pl-PL");
const TRANSACTION_FORMS: Partial<Record<Intl.LDMLPluralRule, string>> = {
  one: "transakcja",
  few: "transakcje",
};
const transactionsLabel = (count: number) =>
  `${count} ${TRANSACTION_FORMS[pluralRules.select(count)] ?? "transakcji"}`;

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
  const { data: coverage } = useResource<{
    accounts: {
      account: string;
      first_date: string;
      last_date: string;
      transactions: number;
    }[];
  }>("/accounts/coverage", revision);
  const [account, setAccount] = useState("");
  const [newAccount, setNewAccount] = useState("");
  const [message, setMessage] = useState("");
  const [results, setResults] = useState<
    { file: string; message: string; receipt?: ImportReceipt; failed?: boolean }[]
  >([]);
  const [syncError, setSyncError] = useState("");
  const accountReady = account !== "__new__" || Boolean(newAccount.trim());
  async function upload(files: FileList | null) {
    if (!files?.length || !accountReady) return;
    setResults([]);
    setMessage("");
    setSyncError("");
    const selectedAccount =
      account === "__new__" ? newAccount.trim() : account.trim();
    await action.run(async () => {
      if (files.length === 1) {
        setResults([{ file: files[0].name, ...(await importStatement(files[0], selectedAccount)) }]);
        return;
      }
      // One unreadable file must not hide what happened to the others.
      const outcomes: typeof results = [];
      for (const file of Array.from(files)) {
        try {
          outcomes.push({ file: file.name, ...(await importStatement(file, selectedAccount)) });
        } catch (error) {
          outcomes.push({
            file: file.name,
            message: error instanceof Error ? error.message : "Nie udało się wczytać.",
            failed: true,
          });
        }
      }
      setResults(outcomes);
    }, "Import zakończony.");
  }
  const chosenAccount =
    account === "__new__" ? newAccount.trim() : account;
  return (
    <>
      <h1 className="mb-6">Import danych</h1>
      <Notice
        error={action.error || syncError}
        notice={message || action.notice}
        undoLabel={action.undoLabel}
        onUndo={() => {
          setMessage("");
          setResults([]);
          void action.undo();
        }}
        onDismiss={() => {
          setMessage("");
          setResults([]);
          action.dismiss();
        }}
      />
      {results.length > 0 && (
        <ul className="card mb-6 divide-y divide-line/40 text-sm">
          {results.map((result, index) => (
            <li key={index} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3">
              <strong className="font-medium wrap-anywhere">{result.file}</strong>
              {result.receipt ? (
                <>
                  <span className="text-muted">
                    {result.receipt.account}
                    {result.receipt.first_date && result.receipt.last_date &&
                      ` · ${dateLabel(result.receipt.first_date)} – ${dateLabel(result.receipt.last_date)}`}
                  </span>
                  <span>
                    nowe: {result.receipt.inserted}
                    {result.receipt.duplicates > 0 && ` · już były: ${result.receipt.duplicates}`}
                    {result.receipt.withdrawals > 0 && ` · do gotówki: ${result.receipt.withdrawals}`}
                    {result.receipt.paired > 0 && ` · wymiany walut: ${result.receipt.paired}`}
                  </span>
                  {result.receipt.first_date && (
                    <button
                      className="ml-auto text-accent hover:underline"
                      onClick={() =>
                        openLedger({
                          account: result.receipt!.account,
                          from: result.receipt!.first_date!,
                          to: result.receipt!.last_date!,
                        })
                      }
                    >
                      Pokaż w historii
                    </button>
                  )}
                </>
              ) : (
                <span className={result.failed ? "text-danger" : "text-muted"}>{result.message}</span>
              )}
            </li>
          ))}
        </ul>
      )}
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="flex flex-col gap-6">
          <section className="card p-6">
            <h2 className="flex items-center gap-1.5">
              Wgraj wyciąg
              <HelpPopover label="Jak działa rozpoznawanie pliku">
                Bank jest rozpoznawany po zawartości pliku, nie po jego nazwie.
                Ten sam plik można wgrać ponownie bez obawy o duplikaty —
                aplikacja pamięta, co już zaimportowała.
              </HelpPopover>
            </h2>
            <label
              className={`mt-4 flex min-h-32 cursor-pointer flex-col items-center justify-center gap-4 rounded-lg border border-dashed border-accent/40 bg-accent-soft/30 px-5 py-6 text-center transition hover:border-accent/70 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent sm:flex-row ${action.busy || !accountReady ? "opacity-60" : ""}`}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                if (!action.busy && accountReady)
                  void upload(e.dataTransfer.files);
              }}
            >
              <Upload className="shrink-0 text-accent" size={22} />
              <strong className="text-sm font-medium text-ink">
                Przeciągnij pliki tutaj
              </strong>
              <span className="btn shrink-0">
                Wybierz pliki
              </span>
              <input
                className="sr-only"
                type="file"
                multiple
                accept=".csv,.pdf,text/csv,application/pdf"
                disabled={action.busy || !accountReady}
                onChange={(e) => {
                  void upload(e.target.files);
                  e.target.value = "";
                }}
              />
            </label>
            <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted [&_button]:inline-flex [&_button]:items-center [&_button]:gap-1 [&_button]:rounded [&_button:hover]:text-accent">
              <Popover.Root>
                <Popover.Trigger>
                  Obsługiwane banki
                  <ChevronDown size={15} />
                </Popover.Trigger>
                <Popover.Portal>
                  <Popover.Content
                    align="start"
                    sideOffset={6}
                    className="z-50 w-64 rounded-xl border border-line bg-surface p-4 text-sm shadow-xl"
                  >
                    <dl className="grid grid-cols-[3rem_minmax(0,1fr)] gap-x-3 gap-y-1.5 [&_dt]:text-muted">
                      <dt>CSV</dt>
                      <dd>Nest, Revolut, Erste</dd>
                      <dt>PDF</dt>
                      <dd>ING, Velo, PKO BP</dd>
                    </dl>
                    <p className="mt-3 text-xs text-muted">Plik do 20 MB.</p>
                  </Popover.Content>
                </Popover.Portal>
              </Popover.Root>
              <Popover.Root>
                <Popover.Trigger className={chosenAccount ? "text-ink" : ""}>
                  {chosenAccount
                    ? `Rachunek: ${chosenAccount}`
                    : "Drugi rachunek w tym samym banku?"}
                  <ChevronDown size={15} />
                </Popover.Trigger>
                <Popover.Portal>
                  <Popover.Content
                    align="start"
                    sideOffset={6}
                    className="z-50 flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-3 rounded-xl border border-line bg-surface p-4 text-sm shadow-xl"
                  >
                    <p className="leading-relaxed text-muted">
                      Potrzebne tylko, gdy masz dwa rachunki w jednym banku,
                      np. osobisty i oszczędnościowy w Nest — wtedy wskaż,
                      do którego trafi ten plik.
                    </p>
                    <AppSelect
                      ariaLabel="Przypisz import do rachunku"
                      value={account}
                      onValueChange={setAccount}
                      options={[
                        { value: "", label: "Rozpoznaj automatycznie" },
                        ...accounts.map((name) => ({ value: name, label: name })),
                        { value: "__new__", label: "+ Nowy rachunek…" },
                      ]}
                    />
                    {account === "__new__" && (
                      <input
                        aria-label="Nazwa nowego rachunku"
                        value={newAccount}
                        onChange={(e) => setNewAccount(e.target.value)}
                        placeholder="Na przykład: Nest oszczędnościowe"
                        maxLength={80}
                        required
                      />
                    )}
                  </Popover.Content>
                </Popover.Portal>
              </Popover.Root>
            </div>
          </section>
          <section className="card p-6">
            <h2 className="flex items-center gap-1.5">
              Folder danych
              <HelpPopover label="Jak działa folder danych">
                Skopiuj pobrane wyciągi do folderu danych i kliknij „Wczytaj
                nowe pliki” — aplikacja wczyta naraz wszystko, czego jeszcze nie
                ma. Plik wyciągu możesz potem usunąć z komputera.
              </HelpPopover>
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              Wyciągi skopiowane do folderu wczytasz jednym kliknięciem.
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <button
                className="btn"
                disabled={action.busy}
                onClick={() => {
                  setSyncError("");
                  setResults([]);
                  action.run(async () => {
                    const result = await request<{
                      transactions_inserted: number;
                      error_files: [string, string][];
                      unsupported_files: string[];
                    }>("/sync", "POST");
                    setMessage(`Nowe transakcje: ${result.transactions_inserted}.`);
                    const failures = [
                      ...result.error_files.map(([f, e]) => `${f}: ${e}`),
                      ...result.unsupported_files.map(
                        (f) => `Nieobsługiwany format: ${f}`,
                      ),
                    ];
                    if (failures.length) setSyncError(failures.join(" "));
                  });
                }}
              >
                <RefreshCw size={16} /> Wczytaj nowe pliki
              </button>
              <button
                className="btn-quiet"
                onClick={() =>
                  fetch("/open-data-folder", { method: "POST" }).catch(() => {})
                }
              >
                <FolderOpen size={16} /> Otwórz folder
              </button>
            </div>
          </section>
        </div>
        <section className="card p-6">
          <h2>Twoje rachunki</h2>
          {coverage?.accounts.length ? (
            <ul className="mt-3 divide-y divide-line/40">
              {coverage.accounts.map((item) => (
                <li
                  key={item.account}
                  className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-4 py-2.5"
                >
                  <span className="truncate text-sm font-medium">{item.account}</span>
                  <span className="text-sm tabular-nums">
                    dane do {dateLabel(item.last_date)}
                  </span>
                  <span className="text-xs text-muted">
                    {transactionsLabel(item.transactions)}
                  </span>
                  <span className="text-right text-xs text-muted tabular-nums">
                    od {dateLabel(item.first_date)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-muted">
              Po pierwszym imporcie zobaczysz tu, do którego dnia masz dane z
              każdego rachunku.
            </p>
          )}
        </section>
      </div>
    </>
  );
}
