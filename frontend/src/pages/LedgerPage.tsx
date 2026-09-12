import { nodeColor } from "../components/CategoryChart";
import { useState, Fragment } from "react";
import {
  Plus,
  Search,
  ChevronDown,
  ChevronRight,
  Link2,
  ArrowLeft,
  ArrowRight,
  Unlink,
} from "lucide-react";
import type { Category, LedgerData, Block } from "../domain";
import { request, useResource, useAction, useSessionState } from "../hooks";
import { money } from "../api";
import {
  CategorySelect,
  groupCategories,
  Modal,
  Notice,
} from "../components/Forms";
import { ManualForm, GroupForm } from "../components/TransactionForms";
export default function LedgerPage({
  categories,
  revision,
  onChanged,
}: {
  categories: Category[];
  revision: number;
  onChanged: () => void;
}) {
  const [query, setQuery] = useSessionState("ledger.query", ""),
    [direction, setDirection] = useSessionState("ledger.direction", "all"),
    [category, setCategory] = useSessionState<string[]>("ledger.category", []),
    [page, setPage] = useSessionState("ledger.page", 1),
    [linksTab, setLinksTab] = useSessionState<"relations" | "groups">(
      "ledger.linksTab",
      "relations",
    ),
    [selected, setSelected] = useState<number[]>([]),
    [expanded, setExpanded] = useSessionState<string[]>("ledger.expanded", []),
    [editing, setEditing] = useState<Block | null>(null),
    [editCategory, setEditCategory] = useState(""),
    [modal, setModal] = useState<"manual" | "group" | null>(null),
    [dissolve, setDissolve] = useState<number | null>(null);
  const params = new URLSearchParams({
    q: query,
    direction,
    page: String(page),
  });
  category.forEach((c) => params.append("category", c));
  const { data, error, loading } = useResource<LedgerData>(
    `/ledger?${params}`,
    revision,
  );
  const action = useAction(() => {
    setSelected([]);
    onChanged();
  });
  const selectedRows =
    data?.blocks.filter(
      (row) => row.id !== null && selected.includes(row.id),
    ) ?? [];
  const canGroup =
    selectedRows.length >= 2 &&
    new Set(selectedRows.map((row) => row.currency)).size === 1;
  const categoryGroups = groupCategories(categories);
  function filtersChanged() {
    setPage(1);
    setSelected([]);
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Historia transakcji</h1>
          <p>Każda transakcja. Każda grupa. Pełny obraz.</p>
        </div>
        <button
          className="button primary-button"
          onClick={() => setModal("manual")}
        >
          <Plus size={17} />
          Dodaj transakcję
        </button>
      </div>
      <Notice error={error || action.error} notice={action.notice} />
      {!!(data?.relations.length || data?.cases.length) && (
        <section className="data-card links-panel">
          <div className="links-tabs" role="tablist" aria-label="Powiązania">
            <button
              role="tab"
              aria-selected={linksTab === "relations"}
              className={linksTab === "relations" ? "selected" : ""}
              onClick={() => setLinksTab("relations")}
            >
              Sugerowane powiązania{" "}
              <span className="count">{data?.relations.length ?? 0}</span>
            </button>
            <button
              role="tab"
              aria-selected={linksTab === "groups"}
              className={linksTab === "groups" ? "selected" : ""}
              onClick={() => setLinksTab("groups")}
            >
              Twoje grupy{" "}
              <span className="count">{data?.cases.length ?? 0}</span>
            </button>
          </div>
          {linksTab === "relations" ? (
            data?.relations.length ? (
              data.relations.map((s) => (
                <article className="relation-row" key={s.id}>
                  <div>
                    <strong>{s.payload.title}</strong>
                    <p>{s.payload.rationale}</p>
                    <small>
                      {s.payload.transaction_ids.length} transakcje · Twój
                      koszt: {money(s.payload.personal_amount, s.payload.currency)}
                    </small>
                  </div>
                  <div className="inline-actions">
                    <button
                      className="button"
                      disabled={action.busy}
                      onClick={() =>
                        action.run(
                          () => request(`/suggestions/${s.id}/reject`, "POST"),
                          "Sugestia odrzucona.",
                        )
                      }
                    >
                      Odrzuć
                    </button>
                    <button
                      className="button primary-button"
                      disabled={action.busy}
                      onClick={() =>
                        action.run(
                          () => request(`/suggestions/${s.id}/approve`, "POST"),
                          "Grupa utworzona.",
                        )
                      }
                    >
                      Połącz
                    </button>
                  </div>
                </article>
              ))
            ) : (
              <p className="form-help">Brak sugerowanych powiązań.</p>
            )
          ) : data?.cases.length ? (
            data.cases.map((c) => (
              <div className="relation-row" key={c.id}>
                <span>
                  {c.title} · {money(c.personal_amount, c.currency)}
                </span>
                <button className="button" onClick={() => setDissolve(c.id)}>
                  Rozwiąż grupę
                </button>
              </div>
            ))
          ) : (
            <p className="form-help">Nie masz jeszcze żadnych grup.</p>
          )}
        </section>
      )}
      <section className="data-card">
        <div className="table-toolbar">
          <label className="search-field">
            <Search size={17} />
            <input
              placeholder="Szukaj opisu lub kontrahenta"
              aria-label="Szukaj transakcji"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                filtersChanged();
              }}
            />
          </label>
          <select
            aria-label="Kierunek"
            value={direction}
            onChange={(e) => {
              setDirection(e.target.value);
              filtersChanged();
            }}
          >
            <option value="all">Wszystkie przepływy</option>
            <option value="expense">Wydatki</option>
            <option value="income">Wpływy</option>
          </select>
          <details className="category-filter">
            <summary>
              Kategorie{category.length ? ` (${category.length})` : ""}
            </summary>
            <div>
              {categoryGroups.map(({ parent, children }) => (
                <div className="category-filter-group" key={parent.key}>
                  <label className="category-filter-parent">
                    <input
                      type="checkbox"
                      checked={category.includes(parent.key)}
                      onChange={(e) => {
                        setCategory(
                          e.target.checked
                            ? [...category, parent.key]
                            : category.filter((key) => key !== parent.key),
                        );
                        filtersChanged();
                      }}
                    />
                    <span
                      className="color-dot"
                      style={{ background: nodeColor(parent.key) }}
                    />
                    {parent.label}
                  </label>
                  {children.map((child) => (
                    <label className="category-filter-child" key={child.key}>
                      <input
                        type="checkbox"
                        checked={category.includes(child.key)}
                        onChange={(e) => {
                          setCategory(
                            e.target.checked
                              ? [...category, child.key]
                              : category.filter((key) => key !== child.key),
                          );
                          filtersChanged();
                        }}
                      />
                      <span
                        className="color-dot"
                        style={{ background: nodeColor(child.key) }}
                      />
                      {child.label}
                    </label>
                  ))}
                </div>
              ))}
              <label>
                <input
                  type="checkbox"
                  checked={category.includes("")}
                  onChange={(e) => {
                    setCategory(
                      e.target.checked
                        ? [...category, ""]
                        : category.filter((k) => k !== ""),
                    );
                    filtersChanged();
                  }}
                />
                Do przypisania
              </label>
              <button
                className="button"
                onClick={() => {
                  setCategory([]);
                  filtersChanged();
                }}
              >
                Wyczyść
              </button>
            </div>
          </details>
        </div>
        {selected.length > 0 && (
          <div className="selection-bar">
            <span>{selected.length} zaznaczone</span>
            <button className="button" onClick={() => setSelected([])}>
              Odznacz
            </button>
            <button
              className="button primary-button"
              disabled={!canGroup}
              onClick={() => setModal("group")}
            >
              <Link2 size={16} />
              Połącz w grupę
            </button>
            {selected.length > 1 && !canGroup && (
              <small>Wybierz transakcje w jednej walucie.</small>
            )}
          </div>
        )}
        <div className="table-scroll" aria-busy={loading}>
          <table className="ledger-table">
            <thead>
              <tr>
                <th aria-label="Zaznaczenie" />
                <th>Transakcja</th>
                <th>Kategoria</th>
                <th>Kwota</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {data?.blocks.map((row) => (
                <Fragment key={row.key}>
                  <tr className={row.case_id ? "group-row" : ""}>
                    <td>
                      {row.case_id ? (
                        <button
                          className="icon-button"
                          aria-label={`Rozwiń grupę ${row.description}`}
                          aria-expanded={expanded.includes(row.key)}
                          onClick={() =>
                            setExpanded(
                              expanded.includes(row.key)
                                ? expanded.filter((k) => k !== row.key)
                                : [...expanded, row.key],
                            )
                          }
                        >
                          {expanded.includes(row.key) ? (
                            <ChevronDown size={17} />
                          ) : (
                            <ChevronRight size={17} />
                          )}
                        </button>
                      ) : (
                        <input
                          type="checkbox"
                          aria-label={`Zaznacz ${row.description}`}
                          checked={selected.includes(row.id!)}
                          onChange={(e) =>
                            setSelected(
                              e.target.checked
                                ? [...selected, row.id!]
                                : selected.filter((id) => id !== row.id),
                            )
                          }
                        />
                      )}
                    </td>
                    <td>
                      <button
                        className="transaction-title"
                        onClick={() => {
                          if (row.case_id)
                            setExpanded(
                              expanded.includes(row.key)
                                ? expanded.filter((k) => k !== row.key)
                                : [...expanded, row.key],
                            );
                          else {
                            setEditing(row);
                            setEditCategory(row.category_key ?? "");
                          }
                        }}
                      >
                        {row.case_id && <Link2 size={14} />} {row.description}
                      </button>
                      <div className="row-meta">
                        {row.date} · {row.account}
                        {["PENDING", "PROCESSING"].includes(
                          row.bank_status ?? "",
                        ) && (
                          <span className="pending-label"> · Oczekująca</span>
                        )}
                        {row.counterparty && row.counterparty !== "—"
                          ? ` · ${row.counterparty}`
                          : ""}
                        {row.case_id
                          ? ` · ${row.members.length} transakcje`
                          : ""}
                      </div>
                    </td>
                    <td>
                      <span
                        style={{
                          borderLeft: `3px solid ${nodeColor(row.category_key ?? "uncategorized_expense")}`,
                        }}
                        className={`category-chip ${!row.category_key ? "unassigned" : ""}`}
                      >
                        {row.category_label}
                      </span>
                    </td>
                    <td
                      className={`numeric ${Number(row.case_id ? row.real_amount : row.amount) > 0 ? "positive" : ""}`}
                    >
                      {money(
                        row.case_id ? row.real_amount : (row.amount ?? "0"),
                        row.currency,
                      )}
                      {row.case_id ? (
                        <small className="amount-note">
                          Łącznie w bilansie
                        </small>
                      ) : row.category_key === "transfer_own" ? (
                        <small className="amount-note">Poza bilansem</small>
                      ) : null}
                    </td>
                    <td>
                      {row.case_id ? (
                        <button
                          className="icon-button"
                          aria-label={`Rozwiąż grupę ${row.description}`}
                          onClick={() => setDissolve(row.case_id)}
                        >
                          <Unlink size={16} />
                        </button>
                      ) : (
                        <button
                          className="icon-button"
                          aria-label={`Edytuj ${row.description}`}
                          onClick={() => {
                            setEditing(row);
                            setEditCategory(row.category_key ?? "");
                          }}
                        >
                          <ChevronRight size={17} />
                        </button>
                      )}
                    </td>
                  </tr>
                  {expanded.includes(row.key) &&
                    row.members.map((member) => (
                      <tr className="member-row" key={member.id}>
                        <td />
                        <td>
                          <span>{member.description}</span>
                          <div className="row-meta">
                            {member.date} · {member.account}
                            {member.counterparty !== "—"
                              ? ` · ${member.counterparty}`
                              : ""}
                          </div>
                        </td>
                        <td />
                        <td className="numeric">
                          {money(member.amount, member.currency)}
                          <small className="amount-note">
                            Składnik grupy · nie sumujemy osobno
                          </small>
                        </td>
                        <td />
                      </tr>
                    ))}
                </Fragment>
              ))}
            </tbody>
          </table>
          {!data && loading && (
            <div className="empty-state">Wczytuję transakcje…</div>
          )}
          {data && !data.blocks.length && (
            <div className="empty-state">
              Brak transakcji pasujących do filtrów.
            </div>
          )}
        </div>
        <footer className="table-footer">
          <span>
            {data && data.total
              ? `${(data.page - 1) * 50 + 1}–${(data.page - 1) * 50 + data.blocks.length} z ${data.total}`
              : "0"}{" "}
            pozycji · grupy liczone jako jedna pozycja
          </span>
          <div>
            <button
              className="icon-button"
              disabled={loading || (data?.page ?? 1) <= 1}
              aria-label="Poprzednia strona"
              onClick={() => {
                setPage(page - 1);
                setSelected([]);
              }}
            >
              <ArrowLeft size={16} />
            </button>
            <span>
              {data?.page ?? 1} / {data?.pages ?? 1}
            </span>
            <button
              className="icon-button"
              disabled={loading || (data?.page ?? 1) >= (data?.pages ?? 1)}
              aria-label="Następna strona"
              onClick={() => {
                setPage(page + 1);
                setSelected([]);
              }}
            >
              <ArrowRight size={16} />
            </button>
          </div>
        </footer>
      </section>
      {editing && (
        <Modal
          title="Zmień kategorię"
          onClose={() => setEditing(null)}
          busy={action.busy}
        >
          <form
            className="form-stack"
            onSubmit={async (e) => {
              e.preventDefault();
              if (
                await action.run(() =>
                  request(`/transactions/${editing.id}/category`, "PUT", {
                    category_key: editCategory,
                  }),
                )
              )
                setEditing(null);
            }}
          >
            <Notice error={action.error} />
            <p>{editing.description}</p>
            <p className="form-help">
              {editing.date} · {money(editing.amount!, editing.currency)}
            </p>
            <label>
              Kategoria
              <CategorySelect
                categories={categories}
                value={editCategory}
                onChange={setEditCategory}
              />
            </label>
            <footer className="form-actions">
              <button className="button primary-button" disabled={action.busy}>
                Zapisz kategorię
              </button>
            </footer>
          </form>
        </Modal>
      )}
      {modal === "manual" && (
        <ManualForm
          categories={categories}
          onClose={() => setModal(null)}
          onSaved={onChanged}
        />
      )}
      {modal === "group" && (
        <GroupForm
          categories={categories}
          selected={selectedRows}
          onClose={() => setModal(null)}
          onSaved={() => {
            setSelected([]);
            onChanged();
          }}
        />
      )}
      {dissolve !== null && (
        <Modal
          title="Rozwiązać grupę?"
          onClose={() => setDissolve(null)}
          busy={action.busy}
        >
          <div className="form-stack">
            <Notice error={action.error} />
            <p>
              Transakcje zostaną w historii i znów będą liczone osobno. Możesz
              później utworzyć z nich nową grupę.
            </p>
            <footer className="form-actions">
              <button className="button" onClick={() => setDissolve(null)}>
                Anuluj
              </button>
              <button
                className="button primary-button"
                disabled={action.busy}
                onClick={async () => {
                  if (
                    await action.run(
                      () => request(`/cases/${dissolve}`, "DELETE"),
                      "Grupa rozwiązana.",
                    )
                  )
                    setDissolve(null);
                }}
              >
                Rozwiąż grupę
              </button>
            </footer>
          </div>
        </Modal>
      )}
    </>
  );
}
