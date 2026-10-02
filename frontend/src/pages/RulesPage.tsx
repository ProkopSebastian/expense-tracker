import { useCallback, useState, useEffect, useTransition } from "react";
import { LoaderCircle, Pencil, Search, Trash2 } from "lucide-react";
import type { Category, Rule } from "../domain";
import { request, useResource, useAction, useLoadMoreSentinel } from "../hooks";
import { CategorySelect, Notice, Modal } from "../components/Forms";
import CategoryIcon from "../components/CategoryIcon";

const RULES_PAGE_SIZE = 25;

const RULE_COLUMNS =
  "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 px-5 sm:grid-cols-[minmax(0,2fr)_minmax(0,1.5fr)_7rem_4.5rem]";

function RuleRow({
  rule,
  categories,
  onChanged,
}: {
  rule: Rule;
  categories: Category[];
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState(false),
    [category, setCategory] = useState(rule.category_key),
    [remove, setRemove] = useState(false);
  const action = useAction(() => {
    setEditing(false);
    onChanged();
  });
  const current = categories.find((c) => c.key === rule.category_key);
  return (
    <>
      <div className={`${RULE_COLUMNS} py-3 transition-colors hover:bg-surface-muted/50`}>
        <strong className="min-w-0 text-sm font-medium wrap-anywhere">
          {rule.name}
        </strong>
        <span className="col-start-1 flex min-w-0 items-center gap-2 text-sm text-muted sm:col-auto">
          <CategoryIcon
            categoryKey={rule.category_key}
            customIcon={current?.icon}
            customColor={current?.color}
          />
          <span className="truncate">{rule.category_label}</span>
        </span>
        <span className="hidden text-sm text-muted tabular-nums sm:block">
          {rule.created_at.slice(0, 10).split("-").reverse().join(".")}
        </span>
        <span className="col-start-2 row-span-2 row-start-1 flex items-center justify-end sm:col-auto sm:row-auto">
          <button
            className="inline-grid size-9 place-items-center rounded-lg text-muted transition hover:bg-accent-soft hover:text-accent"
            aria-label={`Zmień kategorię dla ${rule.name}`}
            onClick={() => {
              setCategory(rule.category_key);
              setEditing(true);
            }}
          >
            <Pencil size={16} />
          </button>
          <button
            className="inline-grid size-9 place-items-center rounded-lg text-muted transition hover:bg-danger/10 hover:text-danger"
            aria-label={`Usuń regułę dla ${rule.name}`}
            onClick={() => setRemove(true)}
          >
            <Trash2 size={16} />
          </button>
        </span>
      </div>
      {editing && (
        <Modal
          title="Zmień kategorię"
          onClose={() => setEditing(false)}
          busy={action.busy}
        >
          <div className="flex flex-col gap-5 p-5 sm:p-6">
            <p className="text-sm font-medium">{rule.name}</p>
            <CategorySelect
              categories={categories}
              value={category}
              onChange={setCategory}
              label={`Kategoria ${rule.name}`}
            />
            <p className="text-sm leading-relaxed text-muted">
              Zmiana obejmie też wcześniejsze transakcje przypisane
              automatycznie. Osobno zatwierdzone kategorie pozostaną bez zmian.
            </p>
            <Notice error={action.error} />
            <footer className="flex flex-wrap justify-end gap-2 border-t border-line pt-5">
              <button className="btn" onClick={() => setEditing(false)}>
                Anuluj
              </button>
              <button
                className="btn"
                disabled={
                  action.busy || !category || category === rule.category_key
                }
                onClick={() =>
                  action.run(() =>
                    request(`/rules/${rule.id}`, "PUT", {
                      category_key: category,
                    }),
                  )
                }
              >
                Zapisz
              </button>
            </footer>
          </div>
        </Modal>
      )}
      {remove && (
        <Modal
          title="Usunąć regułę?"
          onClose={() => setRemove(false)}
          busy={action.busy}
        >
          <div className="flex flex-col gap-5 p-5 sm:p-6 [&>p]:text-sm [&>p]:leading-relaxed">
            <p>{rule.name}</p>
            <p className="text-sm leading-relaxed text-muted">
              Przyszłe transakcje tego sprzedawcy nie będą już przypisywane
              automatycznie. Dotychczasowe kategorie pozostaną.
            </p>
            <Notice error={action.error} />
            <footer className="flex flex-wrap justify-end gap-2 border-t border-line pt-5">
              <button className="btn" onClick={() => setRemove(false)}>
                Anuluj
              </button>
              <button
                className="btn-danger"
                disabled={action.busy}
                onClick={() =>
                  action.run(() => request(`/rules/${rule.id}`, "DELETE"))
                }
              >
                Usuń regułę
              </button>
            </footer>
          </div>
        </Modal>
      )}
    </>
  );
}
export default function RulesPage({
  categories,
  revision,
  onChanged,
}: {
  categories: Category[];
  revision: number;
  onChanged: () => void;
}) {
  const { data, error, loading } = useResource<{ rules: Rule[] }>(
    "/rules",
    revision,
  );
  const [query, setQuery] = useState(""),
    [visibleRulesCount, setVisibleRulesCount] = useState(RULES_PAGE_SIZE);
  const [isLoadingMore, startLoadingMore] = useTransition();
  useEffect(() => setVisibleRulesCount(RULES_PAGE_SIZE), [revision]);
  const rules =
    data?.rules.filter((r) =>
      r.name.toLocaleLowerCase().includes(query.toLocaleLowerCase()),
    ) ?? [];
  const visibleRules = rules.slice(0, visibleRulesCount);
  const remainingRulesCount = rules.length - visibleRules.length;
  const loadMore = useCallback(
    () =>
      startLoadingMore(() => setVisibleRulesCount((count) => count + RULES_PAGE_SIZE)),
    [startLoadingMore],
  );
  const sentinelRef = useLoadMoreSentinel(
    loadMore,
    remainingRulesCount > 0 && !isLoadingMore,
  );
  return (
    <>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-baseline gap-3">
          <h1>Reguły sprzedawców</h1>
          <span className="text-sm text-muted" role="status">
            {loading && !data ? "Wczytuję…" : (data?.rules.length ?? 0)}
          </span>
        </div>
        <label className="flex w-full items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2 text-muted sm:w-72 [&_input]:w-full [&_input]:min-w-0 [&_input]:border-0 [&_input]:bg-transparent [&_input]:p-0">
          <Search size={16} />
          <input
            aria-label="Szukaj reguł sprzedawców"
            placeholder="Szukaj sprzedawcy"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setVisibleRulesCount(RULES_PAGE_SIZE);
            }}
          />
        </label>
      </div>
      <Notice error={error} />
      <section className="card overflow-hidden">
        {visibleRules.length > 0 && (
          <div
            className={`${RULE_COLUMNS} hidden pt-4 pb-2 text-xs font-medium text-muted sm:grid`}
          >
            <span>Sprzedawca</span>
            <span>Kategoria</span>
            <span>Dodano</span>
            <span />
          </div>
        )}
        <div className="divide-y divide-line/40">
          {visibleRules.map((rule) => (
            <RuleRow
              key={rule.id}
              rule={rule}
              categories={categories}
              onChanged={onChanged}
            />
          ))}
        </div>
        {!rules.length && !error && (
          <div className="flex min-h-48 flex-col items-center justify-center gap-3 py-8 text-center text-sm text-muted">
            <h2>
              {loading
                ? "Wczytuję…"
                : query
                  ? "Brak wyników"
                  : "Brak reguł sprzedawców"}
            </h2>
            {!loading && !query && (
              <p>Możesz je zapisać podczas klasyfikacji transakcji.</p>
            )}
          </div>
        )}
        {remainingRulesCount > 0 && (
          <div className="flex justify-center p-4" ref={sentinelRef}>
            <button
              className="btn"
              disabled={isLoadingMore}
              aria-busy={isLoadingMore}
              onClick={loadMore}
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
                  Pokaż kolejne {Math.min(RULES_PAGE_SIZE, remainingRulesCount)}
                  <span className="text-muted">
                    · zostało {remainingRulesCount}
                  </span>
                </>
              )}
            </button>
          </div>
        )}
      </section>
    </>
  );
}
