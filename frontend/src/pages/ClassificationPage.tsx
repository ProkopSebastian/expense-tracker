import { useState } from "react";
import { Sparkles, Link2, Check, Search } from "lucide-react";
import type { Category, ClassificationRow } from "../domain";
import { request, useResource, useAction } from "../hooks";
import { money } from "../api";
import { CategorySelect, Notice } from "../components/Forms";
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
  return (
    <article className="grid items-center gap-5 border-b border-line p-5 last:border-0 lg:grid-cols-[minmax(0,1fr)_220px] 2xl:grid-cols-[minmax(0,1fr)_240px_auto]">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2 [&_strong]:text-sm [&_strong]:leading-relaxed [&_strong]:wrap-anywhere">
          <strong>{row.description}</strong>
          {row.suggestion_id && (
            <span className="inline-flex items-center gap-1 rounded-md bg-accent-soft px-2 py-1 text-[10px] font-medium whitespace-nowrap text-accent">
              <Sparkles size={12} />
              AI · {Math.round((row.confidence ?? 0) * 100)}%
            </span>
          )}
        </div>
        <div className="mt-1 text-xs leading-relaxed text-muted">
          {row.date} · {row.count > 1 ? `${row.count} transakcje · Σ ` : ""}
          {Object.entries(row.totals)
            .map(([currency, total]) => money(total, currency))
            .join(" / ")}
          {row.counterparty !== "—" ? ` · ${row.counterparty}` : ""}
        </div>
        {row.rationale && (
          <p className="mt-2 text-xs leading-relaxed text-muted">
            {row.rationale}
          </p>
        )}
        <Notice error={action.error} />
      </div>
      <div className="grid min-w-0 gap-3">
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
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <button
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-line bg-surface px-4 py-2.5 text-sm font-medium shadow-sm transition hover:border-accent/30 hover:bg-accent-soft border-accent! bg-accent! text-white! shadow-accent/15 hover:bg-accent-hover!"
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
          Zapisz
        </button>
        {row.suggestion_id && (
          <button
            className="rounded-lg p-2 text-sm text-muted hover:bg-accent-soft hover:text-accent"
            disabled={action.busy}
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
    [query, setQuery] = useState("");
  async function analyze(kind: "merchants" | "relations") {
    setNotice("");
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
  return (
    <>
      <div className="mb-7 flex flex-wrap items-center justify-between gap-4 [&_p]:mt-2 [&_p]:text-sm [&_p]:leading-relaxed [&_p]:text-muted">
        <div>
          <h1>Do klasyfikacji</h1>
          <p>Uporządkuj wydatki, po swojemu lub z pomocą AI.</p>
        </div>
        <span className="rounded-xl border border-accent/10 bg-accent-soft px-3 py-2 text-xs font-medium whitespace-nowrap text-accent">
          {data?.rows.length ?? 0} do przejrzenia
        </span>
      </div>
      <div className="mb-5 grid gap-4 sm:grid-cols-2">
        <section className="rounded-2xl border border-line bg-surface p-6 shadow-sm [&_p]:my-4 [&_p]:max-w-md [&_p]:text-sm [&_p]:leading-relaxed [&_p]:text-muted">
          <span className="mb-5 grid size-11 place-items-center rounded-2xl bg-accent-soft text-accent">
            <Sparkles size={22} />
          </span>
          <h2>Rozpoznaj sprzedawców</h2>
          <p>
            AI proponuje kategorie dla maksymalnie 20 sprzedawców w jednej
            partii. Ty zatwierdzasz każdą decyzję.
          </p>
          <button
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-line bg-surface px-4 py-2.5 text-sm font-medium shadow-sm transition hover:border-accent/30 hover:bg-accent-soft border-accent! bg-accent! text-white! shadow-accent/15 hover:bg-accent-hover!"
            disabled={
              !aiEnabled ||
              action.busy ||
              !data?.rows.some((r) => r.transaction_id)
            }
            onClick={() => analyze("merchants")}
          >
            {action.busy ? "Analiza trwa…" : "Zaproponuj kategorie"}
            <Sparkles size={15} />
          </button>
        </section>
        <section className="rounded-2xl border border-line bg-surface p-6 shadow-sm [&_p]:my-4 [&_p]:max-w-md [&_p]:text-sm [&_p]:leading-relaxed [&_p]:text-muted">
          <span className="mb-5 grid size-11 place-items-center rounded-2xl bg-accent-soft text-accent bg-info/10! text-info!">
            <Link2 size={22} />
          </span>
          <h2>Znajdź powiązania</h2>
          <p>
            Wspólne zakupy, zwroty i rozliczenia. Analiza obejmuje do 100
            najnowszych transakcji poza grupami.
          </p>
          <button
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-line bg-surface px-4 py-2.5 text-sm font-medium shadow-sm transition hover:border-accent/30 hover:bg-accent-soft"
            disabled={!aiEnabled || action.busy}
            onClick={() => analyze("relations")}
          >
            Wykryj powiązania
            <Link2 size={15} />
          </button>
        </section>
      </div>
      {!aiEnabled && (
        <Notice notice="Aby włączyć AI, ustaw OPENAI_API_KEY w pliku .env i uruchom aplikację ponownie." />
      )}
      <p className="text-sm leading-relaxed text-muted">
        Dane do AI są wysyłane tylko po kliknięciu przycisku. Rozpoznawanie
        sprzedawców może korzystać z wyszukiwania w internecie.
      </p>
      <Notice error={error || action.error} notice={notice || action.notice} />
      <section className="mb-6 overflow-hidden rounded-2xl border border-line bg-surface shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line p-4 lg:p-5">
          <h2>Przejrzyj i przypisz</h2>
          <label className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-line bg-surface px-3 py-2 text-muted max-sm:basis-full [&_input]:w-full [&_input]:min-w-0 [&_input]:border-0 [&_input]:bg-transparent [&_input]:p-0">
            <Search size={16} />
            <input
              aria-label="Szukaj do klasyfikacji"
              placeholder="Szukaj sprzedawcy"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
        </div>
        {rows.map((row) => (
          <ClassificationItem
            key={row.key}
            row={row}
            categories={categories}
            onChanged={onChanged}
          />
        ))}
        {!rows.length && (
          <div className="flex min-h-48 flex-col items-center justify-center gap-4 p-6 text-center text-sm text-muted">
            <Check size={28} />
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
      </section>
    </>
  );
}
