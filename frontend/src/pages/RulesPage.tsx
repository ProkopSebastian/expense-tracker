import { useState, useEffect } from "react";
import { Search, Trash2, Settings2 } from "lucide-react";
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
      <div className="rule-row">
        <span className="rule-icon">
          <Settings2 size={18} />
        </span>
        <div className="rule-name">
          <strong>{rule.name}</strong>
          <div className="row-meta">Dodano {rule.created_at.slice(0, 10)}</div>
          <Notice error={action.error} />
        </div>
        <CategorySelect
          categories={categories}
          value={category}
          onChange={setCategory}
          label={`Kategoria ${rule.name}`}
        />
        <button
          className="button"
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
          className="icon-button"
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
          <div className="form-stack">
            <p>{rule.name}</p>
            <p className="form-help">
              Przyszłe transakcje tego sprzedawcy nie będą już klasyfikowane
              przez tę regułę. Dotychczasowe kategorie pozostaną.
            </p>
            <Notice error={action.error} />
            <footer className="form-actions">
              <button className="button" onClick={() => setRemove(false)}>
                Anuluj
              </button>
              <button
                className="button danger-button"
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
      <div className="page-heading">
        <div>
          <h1>Reguły sprzedawców</h1>
          <p>Jedna decyzja teraz. Mniej pracy przy kolejnych wydatkach.</p>
        </div>
        <span className="page-count">{data?.rules.length ?? 0} reguł</span>
      </div>
      <div className="info-banner">
        <Settings2 size={20} />
        <p>
          Zmiana reguły poprawia również wcześniejsze transakcje sklasyfikowane
          przez tę regułę. Zachowuje decyzje zatwierdzone osobno ręcznie lub
          przez AI.
        </p>
      </div>
      <Notice error={error} />
      <section className="data-card">
        <div className="table-toolbar">
          <h2>Zapamiętani sprzedawcy</h2>
          <label className="search-field">
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
          <div className="empty-state">
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
