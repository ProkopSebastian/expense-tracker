import { useState } from "react";
import { Plus } from "lucide-react";
import type { Category, LedgerData, Block } from "../domain";
import { useResource, useAction, useSessionState } from "../hooks";
import { buildCategoryTree, Notice } from "../components/Forms";
import { ManualForm, GroupForm } from "../components/TransactionForms";
import LedgerFilterBar from "../components/LedgerFilterBar";
import LedgerLinksPanel from "../components/LedgerLinksPanel";
import LedgerTable from "../components/LedgerTable";
import { EditCategoryModal, DissolveGroupModal } from "../components/LedgerModals";

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
    [closedMonths, setClosedMonths] = useSessionState<string[]>(
      "ledger.closedMonths",
      [],
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
  const categoryTree = buildCategoryTree(categories);
  const months = new Map<string, Block[]>();
  for (const row of data?.blocks ?? []) {
    const month = row.date.slice(0, 7);
    const rows = months.get(month) ?? [];
    rows.push(row);
    months.set(month, rows);
  }
  function filtersChanged() {
    setPage(1);
    setSelected([]);
  }
  function changePage(nextPage: number) {
    setPage(nextPage);
    setSelected([]);
  }
  return (
    <>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <h1>Historia transakcji</h1>
        <button
          className="inline-flex items-center justify-center gap-2 rounded-lg border border-line bg-surface px-3.5 py-2 text-sm font-medium transition hover:bg-accent-soft"
          onClick={() => setModal("manual")}
        >
          <Plus size={17} />
          Dodaj transakcję
        </button>
      </div>
      <Notice error={error || action.error} notice={action.notice} />
      <LedgerLinksPanel
        relations={data?.relations ?? []}
        cases={data?.cases ?? []}
        linksTab={linksTab}
        onLinksTabChange={setLinksTab}
        action={action}
        onDissolve={setDissolve}
      />
      <section className="mb-6 border-t border-line">
        <LedgerFilterBar
          query={query}
          onQueryChange={(value) => {
            setQuery(value);
            filtersChanged();
          }}
          direction={direction}
          onDirectionChange={(value) => {
            setDirection(value);
            filtersChanged();
          }}
          category={category}
          onCategoryChange={(value) => {
            setCategory(value);
            filtersChanged();
          }}
          categoryTree={categoryTree}
        />
        <LedgerTable
          data={data}
          loading={loading}
          page={page}
          onPageChange={changePage}
          selected={selected}
          onSelectedChange={setSelected}
          canGroup={canGroup}
          onOpenGroupModal={() => setModal("group")}
          months={months}
          closedMonths={closedMonths}
          onClosedMonthsChange={setClosedMonths}
          expanded={expanded}
          onExpandedChange={setExpanded}
          onEditRow={(row) => {
            setEditing(row);
            setEditCategory(row.category_key ?? "");
          }}
          onDissolveCase={setDissolve}
        />
      </section>
      {editing && (
        <EditCategoryModal
          editing={editing}
          editCategory={editCategory}
          onEditCategoryChange={setEditCategory}
          categories={categories}
          action={action}
          onClose={() => setEditing(null)}
        />
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
        <DissolveGroupModal
          caseId={dissolve}
          action={action}
          onClose={() => setDissolve(null)}
        />
      )}
    </>
  );
}
