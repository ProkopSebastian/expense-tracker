import { useState, useEffect } from "react";
import { Search, Trash2 } from "lucide-react";
import type { Category, Rule } from "../domain";
import { request, useResource, useAction } from "../hooks";
import { CategorySelect, Notice, Modal } from "../components/Forms";
function RuleRow({
  rule,
  categories,
  onChanged,
}: {
  rule: Rule;
  categories: Category[];
  onChanged: () => void;
}) {
  const [category, setCategory] = useState(rule.category_key),
    [remove, setRemove] = useState(false);
  const action = useAction(onChanged);
  useEffect(() => setCategory(rule.category_key), [rule.category_key]);
  return (
    <>
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-3 border-b border-line py-4 lg:grid-cols-[minmax(0,1fr)_minmax(200px,240px)_auto_auto] lg:gap-4">
        <div className="col-span-2 min-w-0 lg:col-span-1">
          <strong className="text-sm font-medium wrap-anywhere">
            {rule.name}
          </strong>
          <div className="mt-1 text-xs leading-relaxed text-muted">
            Dodano {rule.created_at.slice(0, 10)}
          </div>
          <Notice error={action.error} />
        </div>
        <div className="col-span-2 flex min-w-0 items-center gap-2 lg:col-span-1 [&>span]:w-full">
          <CategorySelect
            categories={categories}
            value={category}
            onChange={setCategory}
            label={`Kategoria ${rule.name}`}
          />
        </div>
        <button
          className="col-start-1 justify-self-start rounded-lg border border-line bg-surface px-3.5 py-2 text-sm font-medium transition hover:bg-accent-soft lg:col-auto"
          disabled={action.busy || category === rule.category_key || !category}
          onClick={() =>
            action.run(() =>
              request(`/rules/${rule.id}`, "PUT", { category_key: category }),
            )
          }
        >
          Zapisz
        </button>
        <button
          className="col-start-2 inline-grid size-9 justify-self-end place-items-center rounded-lg text-muted transition hover:bg-danger/10 hover:text-danger lg:col-auto"
          aria-label={`Usuń przypisanie dla ${rule.name}`}
          onClick={() => setRemove(true)}
        >
          <Trash2 size={16} />
        </button>
      </div>
      {remove && (
        <Modal
          title="Usunąć przypisanie?"
          onClose={() => setRemove(false)}
          busy={action.busy}
        >
          <div className="flex flex-col gap-5 p-5 sm:p-6 [&>p]:text-sm [&>p]:leading-relaxed [&_label]:flex [&_label]:flex-col [&_label]:gap-2 [&_label]:text-sm [&_label_small]:text-xs [&_label_small]:text-muted [&_summary]:cursor-pointer [&_summary]:text-sm [&_details_label]:mt-3">
            <p>{rule.name}</p>
            <p className="text-sm leading-relaxed text-muted">
              Przyszłe transakcje tego sprzedawcy nie będą już przypisywane
              automatycznie. Dotychczasowe kategorie pozostaną.
            </p>
            <Notice error={action.error} />
            <footer className="flex flex-wrap justify-end gap-2 border-t border-line pt-5">
              <button
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-line bg-surface px-4 py-2.5 text-sm font-medium shadow-sm transition hover:border-accent/30 hover:bg-accent-soft"
                onClick={() => setRemove(false)}
              >
                Anuluj
              </button>
              <button
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-line bg-surface px-4 py-2.5 text-sm font-medium shadow-sm transition hover:border-accent/30 hover:bg-accent-soft border-danger/25! bg-danger/10! text-danger! hover:bg-danger/15!"
                disabled={action.busy}
                onClick={() =>
                  action.run(() => request(`/rules/${rule.id}`, "DELETE"))
                }
              >
                Usuń przypisanie
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
  const [query, setQuery] = useState("");
  const rules =
    data?.rules.filter((r) =>
      r.name.toLocaleLowerCase().includes(query.toLocaleLowerCase()),
    ) ?? [];
  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-4 flex flex-wrap items-center gap-x-5 gap-y-2">
        <h1>Automatyczne przypisania</h1>
        <span className="text-sm font-medium text-muted" role="status">
          {loading && !data
            ? "Wczytuję…"
            : `Sprzedawcy: ${data?.rules.length ?? 0}`}
        </span>
      </div>
      <p className="mb-6 max-w-3xl text-sm leading-relaxed text-muted">
        Zmiana kategorii obejmie też wcześniejsze transakcje przypisane
        automatycznie. Osobno zatwierdzone kategorie pozostaną bez zmian.
      </p>
      <Notice error={error} />
      <section className="mb-6">
        <div className="border-y border-line py-4">
          <label className="flex max-w-md items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2 text-muted [&_input]:w-full [&_input]:min-w-0 [&_input]:border-0 [&_input]:bg-transparent [&_input]:p-0">
            <Search size={16} />
            <input
              aria-label="Szukaj automatycznych przypisań"
              placeholder="Szukaj sprzedawcy"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
        </div>
        {rules.map((rule) => (
          <RuleRow
            key={rule.id}
            rule={rule}
            categories={categories}
            onChanged={onChanged}
          />
        ))}
        {!rules.length && !error && (
          <div className="flex min-h-48 flex-col items-center justify-center gap-3 py-8 text-center text-sm text-muted">
            <h2>
              {loading
                ? "Wczytuję…"
                : query
                  ? "Brak wyników"
                  : "Brak automatycznych przypisań"}
            </h2>
            {!loading && !query && (
              <p>Możesz je zapisać podczas klasyfikacji transakcji.</p>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
