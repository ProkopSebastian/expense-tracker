import { useState, useTransition } from "react";
import * as Popover from "@radix-ui/react-popover";
import { Sparkles, Check, LoaderCircle, Search } from "lucide-react";
import type { Category, ClassificationRow } from "../domain";
import { request, useResource, useAction } from "../hooks";
import { money } from "../api";
import { CategorySelect, Notice } from "../components/Forms";

const CLASSIFICATION_PAGE_SIZE = 25;

function transactionDirection(totals: Record<string, string>) {
  const values = Object.values(totals).map(Number);
  if (
    values.every((value) => value <= 0) &&
    values.some((value) => value < 0)
  ) {
    return "expense";
  }
  if (
    values.every((value) => value >= 0) &&
    values.some((value) => value > 0)
  ) {
    return "income";
  }
  return "mixed";
}

function ClassificationItem({
  row,
  categories,
  onChanged,
}: {
  row: ClassificationRow;
  categories: Category[];
  onChanged: () => void;
}) {
  const [category, setCategory] = useState(row.category_key ?? ""),
    [remember, setRemember] = useState(row.remember);
  const action = useAction(onChanged);
  const amountClassName = {
    expense: "text-danger",
    income: "text-success",
    mixed: "text-info",
  }[transactionDirection(row.totals)];
  const amount = Object.entries(row.totals)
    .map(([currency, total]) => {
      const value = Number(total);
      const sign = value < 0 ? "−" : value > 0 ? "+" : "";
      return `${sign} ${money(Math.abs(value), currency)}`.trim();
    })
    .join(" / ");
  return (
    <article className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-4 gap-y-3 border-b border-line py-4 lg:grid-cols-[minmax(0,1fr)_minmax(130px,160px)_minmax(180px,220px)_auto] lg:items-center lg:gap-5">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <strong className="text-sm font-medium leading-relaxed wrap-anywhere">
            {row.description}
          </strong>
          {row.suggestion_id && (
            <span className="text-xs whitespace-nowrap text-muted">
              AI
              {row.confidence !== null
                ? ` · ${Math.round(row.confidence * 100)}%`
                : ""}
            </span>
          )}
        </div>
        <div className="mt-1 text-xs leading-relaxed text-muted">
          {row.date}
          {row.count > 1 ? ` · ${row.count} transakcje` : ""}
          {row.counterparty !== "—" ? ` · ${row.counterparty}` : ""}
        </div>
        {row.rationale && (
          <details className="mt-2 text-xs text-muted">
            <summary className="w-fit hover:text-accent">
              Dlaczego ta kategoria?
            </summary>
            <p className="mt-2 max-w-xl leading-relaxed">{row.rationale}</p>
          </details>
        )}
        <Notice error={action.error} />
      </div>
      <strong
        className={`max-w-40 text-right text-base font-semibold tracking-tight tabular-nums wrap-anywhere lg:justify-self-end ${amountClassName}`}
        aria-label={`Kwota transakcji: ${amount}`}
      >
        {amount}
      </strong>
      <div className="col-span-2 grid min-w-0 gap-2 lg:col-span-1">
        <div className="flex min-w-0 items-center gap-2 [&>span]:w-full">
          <CategorySelect
            categories={categories}
            value={category}
            onChange={setCategory}
            label={`Kategoria ${row.description}`}
          />
        </div>
        <label className="flex items-center gap-2 text-xs text-muted">
          <input
            type="checkbox"
            checked={remember}
            onChange={(e) => setRemember(e.target.checked)}
          />
          Zapamiętaj regułę
        </label>
      </div>
      <div className="col-span-2 flex flex-wrap items-center gap-2 lg:col-span-1 lg:justify-end">
        <button
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-accent px-3.5 py-2 text-sm font-medium text-white transition hover:bg-accent-hover"
          disabled={!category || action.busy}
          onClick={() =>
            action.run(() =>
              request(
                row.suggestion_id
                  ? `/suggestions/${row.suggestion_id}/approve`
                  : `/transactions/${row.transaction_id}/category`,
                row.suggestion_id ? "POST" : "PUT",
                { category_key: category, remember },
              ),
            )
          }
        >
          <Check size={16} />
          {row.suggestion_id ? "Zatwierdź" : "Przypisz"}
        </button>
        {row.suggestion_id && (
          <button
            className="rounded-lg px-2 py-2 text-sm text-muted transition hover:bg-accent-soft hover:text-accent"
            disabled={action.busy}
            aria-label={`Odrzuć sugestię dla ${row.description}`}
            onClick={() =>
              action.run(() =>
                request(`/suggestions/${row.suggestion_id}/reject`, "POST"),
              )
            }
          >
            Odrzuć
          </button>
        )}
      </div>
    </article>
  );
}
export default function ClassificationPage({
  categories,
  aiEnabled,
  revision,
  onChanged,
}: {
  categories: Category[];
  aiEnabled: boolean;
  revision: number;
  onChanged: () => void;
}) {
  const { data, error, loading } = useResource<{ rows: ClassificationRow[] }>(
    "/classification",
    revision,
  );
  const action = useAction(onChanged);
  const [notice, setNotice] = useState(""),
    [activeKind, setActiveKind] = useState<"merchants" | "relations" | null>(
      null,
    ),
    [query, setQuery] = useState(""),
    [visibleRowsCount, setVisibleRowsCount] = useState(
      CLASSIFICATION_PAGE_SIZE,
    );
  const [isLoadingMore, startLoadingMore] = useTransition();
  async function analyze(kind: "merchants" | "relations") {
    setNotice("");
    setActiveKind(kind);
    await action.run(async () => {
      const result = await request<{
        saved: number;
        groups_processed?: number;
        groups_remaining?: number;
        web_searches?: number;
      }>(`/ai/${kind}`, "POST");
      setNotice(
        kind === "merchants"
          ? `Sprawdzono ${result.groups_processed} sprzedawców. Nowe sugestie: ${result.saved}. Pozostało: ${result.groups_remaining}. Wyszukiwania w internecie: ${result.web_searches}.`
          : `Nowe sugestie powiązań: ${result.saved}. Znajdziesz je w Historii transakcji.`,
      );
    }, "Analiza zakończona.");
  }
  const rows =
    data?.rows.filter((row) =>
      `${row.description} ${row.counterparty}`
        .toLocaleLowerCase()
        .includes(query.toLocaleLowerCase()),
    ) ?? [];
  const suggestions = rows.filter((row) => row.suggestion_id);
  const unclassified = rows.filter((row) => !row.suggestion_id);
  const visibleRows = [...suggestions, ...unclassified].slice(
    0,
    visibleRowsCount,
  );
  const remainingRowsCount = rows.length - visibleRows.length;
  const groups = [
    {
      title: "Sugestie do zatwierdzenia",
      count: suggestions.length,
      rows: visibleRows.filter((row) => row.suggestion_id),
    },
    {
      title: "Bez kategorii",
      count: unclassified.length,
      rows: visibleRows.filter((row) => !row.suggestion_id),
    },
  ];
  return (
    <>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <h1>Do klasyfikacji</h1>
        <span
          className="inline-flex items-center gap-2 text-sm font-medium text-muted"
          role="status"
        >
          {loading && !data ? (
            <>
              <LoaderCircle
                size={14}
                className="animate-spin motion-reduce:animate-none"
              />
              Wczytuję klasyfikacje…
            </>
          ) : (
            `${data?.rows.length ?? 0} do przejrzenia`
          )}
        </span>
      </div>
      <Notice error={error} />
      <div className="flex flex-wrap items-center gap-3 border-y border-line py-4">
        <label className="flex min-w-56 flex-1 items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2 text-muted [&_input]:w-full [&_input]:min-w-0 [&_input]:border-0 [&_input]:bg-transparent [&_input]:p-0">
          <Search size={16} />
          <input
            aria-label="Szukaj do klasyfikacji"
            placeholder="Szukaj sprzedawcy"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setVisibleRowsCount(CLASSIFICATION_PAGE_SIZE);
            }}
          />
        </label>
        <button
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-accent px-3.5 py-2 text-sm font-medium text-white transition hover:bg-accent-hover"
          disabled={
            !aiEnabled ||
            action.busy ||
            !data?.rows.some((row) => row.transaction_id)
          }
          onClick={() => analyze("merchants")}
        >
          <Sparkles size={15} />
          {action.busy && activeKind === "merchants"
            ? "Analiza trwa…"
            : "Zaproponuj kategorie"}
        </button>
        <Popover.Root>
          <Popover.Trigger className="rounded-lg border border-line bg-surface px-3.5 py-2 text-sm font-medium transition hover:bg-accent-soft">
            Narzędzia AI
          </Popover.Trigger>
          <Popover.Portal>
            <Popover.Content
              align="end"
              sideOffset={6}
              className="z-40 w-80 max-w-[calc(100vw-2rem)] rounded-xl border border-line bg-surface p-4 text-sm shadow-xl"
            >
              <h2>Znajdź powiązania</h2>
              <p className="mt-2 leading-relaxed text-muted">
                Wspólne zakupy, zwroty i rozliczenia. Wyniki znajdziesz w
                Historii transakcji.
              </p>
              <Popover.Close asChild>
                <button
                  className="mt-4 rounded-lg border border-line px-3.5 py-2 font-medium transition hover:bg-accent-soft"
                  disabled={!aiEnabled || action.busy}
                  onClick={() => analyze("relations")}
                >
                  Wykryj powiązania
                </button>
              </Popover.Close>
              <p className="mt-4 border-t border-line pt-3 text-xs leading-relaxed text-muted">
                Analiza obejmuje do 100 najnowszych transakcji poza grupami.
              </p>
            </Popover.Content>
          </Popover.Portal>
        </Popover.Root>
      </div>
      <p className="mb-6 mt-2 text-xs leading-relaxed text-muted">
        {aiEnabled
          ? "AI analizuje dane dopiero po kliknięciu. Rozpoznawanie może korzystać z internetu."
          : "Aby korzystać z AI, dodaj klucz API w Ustawieniach."}
      </p>
      {activeKind && (
        <Notice error={action.error} notice={notice || action.notice} />
      )}
      <div className="mb-6">
        {groups.map(
          (group) =>
            group.rows.length > 0 && (
              <section className="mb-7" key={group.title}>
                <div className="flex items-baseline gap-2 border-b border-line pb-2">
                  <h2>{group.title}</h2>
                  <span className="text-xs text-muted">{group.count}</span>
                </div>
                {group.rows.map((row) => (
                  <ClassificationItem
                    key={row.key}
                    row={row}
                    categories={categories}
                    onChanged={onChanged}
                  />
                ))}
              </section>
            ),
        )}
        {!rows.length && !error && (
          <div className="flex min-h-48 flex-col items-center justify-center gap-4 py-8 text-center text-sm text-muted">
            {loading ? (
              <LoaderCircle
                size={28}
                className="animate-spin motion-reduce:animate-none"
              />
            ) : (
              <Check size={28} />
            )}
            <h3>
              {loading
                ? "Wczytuję…"
                : query
                  ? "Brak wyników."
                  : "Wszystko przypisane."}
            </h3>
            {!query && !loading && (
              <p>Nowe transakcje pojawią się tutaj po imporcie.</p>
            )}
          </div>
        )}
        {remainingRowsCount > 0 && (
          <div className="flex justify-center">
            <button
              className="rounded-lg border border-line bg-surface px-4 py-2.5 text-sm font-medium transition hover:bg-accent-soft"
              disabled={isLoadingMore}
              aria-busy={isLoadingMore}
              onClick={() =>
                startLoadingMore(() =>
                  setVisibleRowsCount(
                    (count) => count + CLASSIFICATION_PAGE_SIZE,
                  ),
                )
              }
            >
              {isLoadingMore ? (
                <>
                  <LoaderCircle
                    size={16}
                    className="animate-spin motion-reduce:animate-none"
                  />
                  Wczytuję…
                </>
              ) : (
                <>
                  Pokaż kolejne{" "}
                  {Math.min(CLASSIFICATION_PAGE_SIZE, remainingRowsCount)}
                  <span className="text-muted">
                    · zostało {remainingRowsCount}
                  </span>
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </>
  );
}
