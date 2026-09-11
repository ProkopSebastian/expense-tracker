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
    <article className="classification-row">
      <div className="classification-description">
        <div className="row-heading">
          <strong>{row.description}</strong>
          {row.suggestion_id && (
            <span className="ai-badge">
              <Sparkles size={12} />
              AI · {Math.round((row.confidence ?? 0) * 100)}%
            </span>
          )}
        </div>
        <div className="row-meta">
          {row.date} · {row.count > 1 ? `${row.count} transakcje · Σ ` : ""}
          {Object.entries(row.totals)
            .map(([currency, total]) => money(total, currency))
            .join(" / ")}
          {row.counterparty !== "—" ? ` · ${row.counterparty}` : ""}
        </div>
        {row.rationale && <p className="rationale">{row.rationale}</p>}
        <Notice error={action.error} />
      </div>
      <div className="classification-controls">
        <CategorySelect
          categories={categories}
          value={category}
          onChange={setCategory}
          label={`Kategoria ${row.description}`}
        />
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={remember}
            onChange={(e) => setRemember(e.target.checked)}
          />
          Zapamiętaj regułę
        </label>
      </div>
      <div className="inline-actions">
        <button
          className="button primary-button"
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
            className="text-button"
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
      <div className="page-heading">
        <div>
          <h1>Do klasyfikacji</h1>
          <p>Uporządkuj wydatki, po swojemu lub z pomocą AI.</p>
        </div>
        <span className="page-count">
          {data?.rows.length ?? 0} do przejrzenia
        </span>
      </div>
      <div className="ai-cards">
        <section className="ai-card">
          <span className="feature-icon">
            <Sparkles size={22} />
          </span>
          <h2>Rozpoznaj sprzedawców</h2>
          <p>
            AI proponuje kategorie dla maksymalnie 20 sprzedawców w jednej
            partii. Ty zatwierdzasz każdą decyzję.
          </p>
          <button
            className="button primary-button"
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
        <section className="ai-card">
          <span className="feature-icon pale">
            <Link2 size={22} />
          </span>
          <h2>Znajdź powiązania</h2>
          <p>
            Wspólne zakupy, zwroty i rozliczenia. Analiza obejmuje do 100
            najnowszych transakcji poza grupami.
          </p>
          <button
            className="button"
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
      <p className="form-help">
        Dane do AI są wysyłane tylko po kliknięciu przycisku. Rozpoznawanie
        sprzedawców może korzystać z wyszukiwania w internecie.
      </p>
      <Notice error={error || action.error} notice={notice || action.notice} />
      <section className="data-card">
        <div className="table-toolbar">
          <h2>Przejrzyj i przypisz</h2>
          <label className="search-field">
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
          <div className="empty-state">
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
