import { useState } from "react";
import { Plus } from "lucide-react";
import type { Category, LedgerData, Block } from "../domain";
import { useResource, useAction, useSessionState } from "../hooks";
import { buildCategoryTree, Notice } from "../components/Forms";
import {
  ManualForm,
  GroupForm,
  FundWalletForm,
  SellWalletForm,
} from "../components/TransactionForms";
import LedgerFilterBar from "../components/LedgerFilterBar";
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
    [currency, setCurrency] = useSessionState("ledger.currency", "all"),
    [page, setPage] = useSessionState("ledger.page", 1),
    [selected, setSelected] = useState<number[]>([]),
    [expanded, setExpanded] = useSessionState<string[]>("ledger.expanded", []),
    [editing, setEditing] = useState<Block | null>(null),
    [editCategory, setEditCategory] = useState(""),
    [modal, setModal] = useState<"manual" | "group" | "fund" | "sell" | null>(
      null,
    ),
    [dissolve, setDissolve] = useState<number | null>(null);
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
  // One row: the bank only recorded the money leaving, so the other side is entered by hand.
  // Two rows: both sides were imported and only need linking.
  const outflows = selectedRows.filter((row) => Number(row.amount) < 0);
  const inflows = selectedRows.filter((row) => Number(row.amount) > 0);
  const canFund =
    (selectedRows.length === 1 && outflows.length === 1) ||
    (selectedRows.length === 2 && outflows.length === 1 && inflows.length === 1);
  // Money arriving on its own is the other direction: currency sold back.
  const canSell = inflows.length === 1 && inflows[0].currency === "PLN" &&
    (selectedRows.length === 1 || (selectedRows.length === 2 && outflows.length === 1));
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
          canFund={canFund}
          onOpenFundModal={() => setModal("fund")}
          canSell={canSell}
          onOpenSellModal={() => setModal("sell")}
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
        />
      )}
      {modal === "manual" && (
        <ManualForm
          categories={categories}
          onClose={() => setModal(null)}
          onSaved={onChanged}
        />
      )}
      {modal === "group" && hasSelection && (
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
      {modal === "fund" && hasSelection && (
        <FundWalletForm
          categories={categories}
          selected={selectedRows}
          onClose={() => setModal(null)}
          onSaved={() => {
            setSelected([]);
            onChanged();
          }}
        />
      )}
      {modal === "sell" && hasSelection && (
        <SellWalletForm
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
