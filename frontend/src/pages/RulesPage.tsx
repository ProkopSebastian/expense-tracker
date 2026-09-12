import { useState, useEffect } from "react";
import { Search, Trash2, Settings2 } from "lucide-react";
import type { Category, Rule } from "../domain";
import { request, useResource, useAction } from "../hooks";
import { CategorySelect, Notice, Modal } from "../components/Forms";
import { nodeColor } from "../components/CategoryChart";
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
      <div className="grid grid-cols-[minmax(0,1fr)_auto_36px] items-center gap-3 border-t border-line p-5 xl:grid-cols-[36px_minmax(150px,1fr)_minmax(220px,1fr)_auto_36px]">
        <span className="hidden size-9 place-items-center rounded-xl bg-accent-soft text-accent xl:grid">
          <Settings2 size={18} />
        </span>
        <div className="col-span-full xl:col-auto [&_strong]:text-sm [&_strong]:font-medium [&_strong]:wrap-anywhere">
          <strong>{rule.name}</strong>
          <div className="mt-1 text-xs leading-relaxed text-muted">
            Dodano {rule.created_at.slice(0, 10)}
          </div>
          <Notice error={action.error} />
        </div>
        <div className="flex min-w-0 items-center gap-2 [&_select]:w-full [&_select]:min-w-0 [&_select]:flex-1">
          <span
            className="size-2.5 shrink-0 rounded-full"
            style={{
              background: nodeColor(category || "uncategorized_expense"),
            }}
          />
          <CategorySelect
            categories={categories}
            value={category}
            onChange={setCategory}
            label={`Kategoria ${rule.name}`}
          />
        </div>
        <button
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-line bg-white px-4 py-2.5 text-sm font-medium shadow-sm transition hover:border-accent/30 hover:bg-accent-soft"
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
          className="inline-grid size-9 shrink-0 place-items-center rounded-lg text-muted transition hover:bg-accent-soft hover:text-accent"
          aria-label={`Usuń regułę ${rule.name}`}
          onClick={() => setRemove(true)}
        >
          <Trash2 size={16} />
        </button>
      </div>
      {remove && (
        <Modal
          title="Usunąć regułę?"
          onClose={() => setRemove(false)}
          busy={action.busy}
        >
          <div className="flex flex-col gap-5 p-5 sm:p-6 [&>p]:text-sm [&>p]:leading-relaxed [&_label]:flex [&_label]:flex-col [&_label]:gap-2 [&_label]:text-sm [&_label_small]:text-xs [&_label_small]:text-muted [&_summary]:cursor-pointer [&_summary]:text-sm [&_details_label]:mt-3">
            <p>{rule.name}</p>
            <p className="text-sm leading-relaxed text-muted">
              Przyszłe transakcje tego sprzedawcy nie będą już klasyfikowane
              przez tę regułę. Dotychczasowe kategorie pozostaną.
            </p>
            <Notice error={action.error} />
            <footer className="flex flex-wrap justify-end gap-2 border-t border-line pt-5">
              <button
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-line bg-white px-4 py-2.5 text-sm font-medium shadow-sm transition hover:border-accent/30 hover:bg-accent-soft"
                onClick={() => setRemove(false)}
              >
                Anuluj
              </button>
              <button
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-line bg-white px-4 py-2.5 text-sm font-medium shadow-sm transition hover:border-accent/30 hover:bg-accent-soft border-rose-200! bg-rose-50! text-rose-700! hover:bg-rose-100!"
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
  const [query, setQuery] = useState("");
  const rules =
    data?.rules.filter((r) =>
      r.name.toLocaleLowerCase().includes(query.toLocaleLowerCase()),
    ) ?? [];
  return (
    <>
      <div className="mb-7 flex flex-wrap items-center justify-between gap-4 [&_p]:mt-2 [&_p]:text-sm [&_p]:leading-relaxed [&_p]:text-muted">
        <div>
          <h1>Reguły sprzedawców</h1>
          <p>Jedna decyzja teraz. Mniej pracy przy kolejnych wydatkach.</p>
        </div>
        <span className="rounded-xl border border-accent/10 bg-accent-soft px-3 py-2 text-xs font-medium whitespace-nowrap text-accent">
          {data?.rules.length ?? 0} reguł
        </span>
      </div>
      <div className="mb-6 flex items-start gap-3 rounded-2xl border border-accent/10 bg-accent-soft p-5 text-accent [&_svg]:mt-0.5 [&_svg]:shrink-0 [&_p]:max-w-4xl [&_p]:text-sm [&_p]:leading-relaxed">
        <Settings2 size={20} />
        <p>
          Zmiana reguły poprawia również wcześniejsze transakcje sklasyfikowane
          przez tę regułę. Zachowuje decyzje zatwierdzone osobno ręcznie lub
          przez AI.
        </p>
      </div>
      <Notice error={error} />
      <section className="mb-6 overflow-hidden rounded-2xl border border-line bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line p-4 lg:p-5">
          <h2>Zapamiętani sprzedawcy</h2>
          <label className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-line bg-white px-3 py-2 text-muted max-sm:basis-full [&_input]:w-full [&_input]:min-w-0 [&_input]:border-0 [&_input]:bg-transparent [&_input]:p-0">
            <Search size={16} />
            <input
              aria-label="Szukaj reguł"
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
        {!rules.length && (
          <div className="flex min-h-48 flex-col items-center justify-center gap-4 p-6 text-center text-sm text-muted">
            <Settings2 size={28} />
            <h3>{loading ? "Wczytuję…" : "Brak reguł do pokazania"}</h3>
            <p>
              Reguły powstają po wybraniu „Zapamiętaj regułę” przy klasyfikacji.
            </p>
          </div>
        )}
      </section>
    </>
  );
}
