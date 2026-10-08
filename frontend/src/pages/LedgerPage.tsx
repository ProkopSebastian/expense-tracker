import { useState } from "react";
import { Plus } from "lucide-react";
import type { Category, LedgerData, Block } from "../domain";
import { useResource, useAction, useSessionState } from "../hooks";
import { buildCategoryTree, Notice } from "../components/Forms";
import {
  ManualForm,
  GroupForm,
} from "../components/TransactionForms";
import LedgerFilterBar from "../components/LedgerFilterBar";
import LedgerTable from "../components/LedgerTable";
import { EditCategoryModal, DissolveGroupModal } from "../components/LedgerModals";
import { ForeignWithdrawalForm, type Withdrawal } from "../components/CashForms";

export default function LedgerPage({
  accounts,
  categories,
  revision,
  onChanged,
}: {
  accounts: string[];
  categories: Category[];
  revision: number;
  onChanged: () => void;
}) {
  const [query, setQuery] = useSessionState("ledger.query", ""),
    [direction, setDirection] = useSessionState("ledger.direction", "all"),
    [category, setCategory] = useSessionState<string[]>("ledger.category", []),
    [currency, setCurrency] = useSessionState("ledger.currency", "all"),
    [page, setPage] = useSessionState("ledger.page", 1),
    [selected, setSelected] = useState<number[]>([]),
    [expanded, setExpanded] = useSessionState<string[]>("ledger.expanded", []),
    [editing, setEditing] = useState<Block | null>(null),
    [editCategory, setEditCategory] = useState(""),
    [modal, setModal] = useState<"manual" | "group" | null>(
      null,
    ),
    [dissolve, setDissolve] = useState<number | null>(null),
    [foreign, setForeign] = useState<Withdrawal | null>(null),
    [manualEditing, setManualEditing] = useState<Block | null>(null);
  const params = new URLSearchParams({
    q: query,
    direction,
    page: String(page),
  });
  category.forEach((c) => params.append("category", c));
  if (currency !== "all") params.append("currency", currency);
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
  // A refetch empties this list for a moment while the modal is still open, and every form
  // below reads selectedRows[0]. Keep them unmounted until there is something to act on.
  const hasSelection = selectedRows.length > 0;
  const canGroup = selectedRows.length >= 2;
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
      <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
        <h1>Historia transakcji</h1>
        <button
          className="btn"
          onClick={() => setModal("manual")}
        >
          <Plus size={17} />
          Dodaj transakcję
        </button>
      </div>
      <Notice
        error={error || action.error}
        notice={action.notice}
        undoLabel={action.undoLabel}
        onUndo={action.undo}
        onDismiss={action.dismiss}
      />
      <section className="mb-6">
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
          currency={currency}
          onCurrencyChange={(value) => {
            setCurrency(value);
            filtersChanged();
          }}
          currencies={data?.currencies ?? []}
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
          onEditManual={() => {
            setManualEditing(editing);
            setEditing(null);
          }}
          onForeignCash={() => {
            setForeign({
              transactionId: editing.id!,
              date: editing.date,
              account: editing.account,
              bankAmount: String(-Number(editing.amount)),
              bankCurrency: editing.currency,
              cashAmount: editing.cash_amount ?? null,
              cashCurrency: editing.cash_currency ?? null,
            });
            setEditing(null);
          }}
        />
      )}
      {manualEditing && (
        <ManualForm
          existing={manualEditing}
          accounts={accounts}
          categories={categories}
          onClose={() => setManualEditing(null)}
          action={action}
        />
      )}
      {foreign && (
        <ForeignWithdrawalForm withdrawal={foreign} expanded onClose={() => setForeign(null)} action={action} />
      )}
      {modal === "manual" && (
        <ManualForm
          accounts={accounts}
          categories={categories}
          onClose={() => setModal(null)}
          action={action}
        />
      )}
      {modal === "group" && hasSelection && (
        <GroupForm
          categories={categories}
          selected={selectedRows}
          onClose={() => setModal(null)}
          action={action}
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
