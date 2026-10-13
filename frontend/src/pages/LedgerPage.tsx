import { useCallback, useState, useTransition } from "react";
import { Plus } from "lucide-react";
import type { Category, LedgerData, Block, GroupCase } from "../domain";
import { request, useResource, useAction, useSessionState, useLoadMoreSentinel } from "../hooks";
import { buildCategoryTree, Notice } from "../components/Forms";
import {
  ManualForm,
  GroupForm,
} from "../components/TransactionForms";
import LedgerFilterBar from "../components/LedgerFilterBar";
import LedgerTable, { LEDGER_PAGE_SIZE } from "../components/LedgerTable";
import {
  EditCategoryModal,
  DissolveGroupModal,
  DeleteTransactionsModal,
  PickGroupModal,
} from "../components/LedgerModals";
import { ForeignWithdrawalForm, type Withdrawal } from "../components/CashForms";

const isSelectable = (row: Block) => row.id !== null && !row.case_id && !row.from_cash_count;

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
    [account, setAccount] = useSessionState("ledger.account", "all"),
    [dateFrom, setDateFrom] = useSessionState("ledger.from", ""),
    [dateTo, setDateTo] = useSessionState("ledger.to", ""),
    [unvalued, setUnvalued] = useSessionState("ledger.unvalued", false),
    [shown, setShown] = useSessionState("ledger.shown", LEDGER_PAGE_SIZE),
    [selected, setSelected] = useState<Block[]>([]),
    [expanded, setExpanded] = useSessionState<string[]>("ledger.expanded", []),
    [editing, setEditing] = useState<Block | null>(null),
    [editCategory, setEditCategory] = useState(""),
    [modal, setModal] = useState<"manual" | "group" | "pick-group" | null>(
      null,
    ),
    [groupEdit, setGroupEdit] = useState<{ group: GroupCase; add: Block[] } | null>(null),
    [dissolve, setDissolve] = useState<number | null>(null),
    [deleting, setDeleting] = useState<Block[] | null>(null),
    [selectError, setSelectError] = useState(""),
    [foreign, setForeign] = useState<Withdrawal | null>(null),
    [manualEditing, setManualEditing] = useState<Block | null>(null);
  const params = new URLSearchParams({
    q: query,
    direction,
    limit: String(shown),
  });
  category.forEach((c) => params.append("category", c));
  if (currency !== "all") params.append("currency", currency);
  if (account !== "all") params.append("account", account);
  if (dateFrom) params.append("date_from", dateFrom);
  if (dateTo) params.append("date_to", dateTo);
  if (unvalued) params.append("unvalued", "true");
  const filtered =
    query !== "" || direction !== "all" || category.length > 0 || currency !== "all" ||
    account !== "all" || dateFrom !== "" || dateTo !== "" || unvalued;
  const { data, error, loading } = useResource<LedgerData>(
    `/ledger?${params}`,
    revision,
  );
  const action = useAction(() => {
    setSelected([]);
    onChanged();
  });
  const canGroup = selected.length >= 2;
  const selectedIds = new Set(selected.map((row) => row.id));
  const loadedSelectable = data?.blocks.filter(isSelectable) ?? [];
  const loadedChosen = loadedSelectable.filter((row) => selectedIds.has(row.id)).length;
  const allSelected =
    loadedSelectable.length > 0 && loadedChosen === loadedSelectable.length
      ? true
      : loadedChosen > 0
        ? ("mixed" as const)
        : false;
  async function toggleAll() {
    setSelectError("");
    const everything = new URLSearchParams(params);
    everything.set("limit", String(Math.max(data?.total ?? 1, 1)));
    try {
      const rows = (await request<LedgerData>(`/ledger?${everything}`)).blocks.filter(isSelectable);
      const ids = new Set(rows.map((row) => row.id));
      const rest = selected.filter((row) => !ids.has(row.id));
      setSelected(allSelected === true ? rest : [...rest, ...rows]);
    } catch (error) {
      setSelectError(error instanceof Error ? error.message : "Nie udało się zaznaczyć transakcji.");
    }
  }
  const [isLoadingMore, startLoadingMore] = useTransition();
  const remaining = (data?.total ?? 0) - (data?.blocks.length ?? 0);
  const loadingMore = loading && (data?.blocks.length ?? 0) < Math.min(shown, data?.total ?? 0);
  const loadMore = useCallback(
    () => startLoadingMore(() => setShown((count) => count + LEDGER_PAGE_SIZE)),
    [startLoadingMore, setShown],
  );
  const sentinelRef = useLoadMoreSentinel(loadMore, remaining > 0 && !loading && !isLoadingMore);
  const categoryTree = buildCategoryTree(categories);
  const months = new Map<string, Block[]>();
  for (const row of data?.blocks ?? []) {
    const month = row.date.slice(0, 7);
    const rows = months.get(month) ?? [];
    rows.push(row);
    months.set(month, rows);
  }
  function filtersChanged() {
    setShown(LEDGER_PAGE_SIZE);
  }
  function clearFilters() {
    setQuery("");
    setDirection("all");
    setCategory([]);
    setCurrency("all");
    setAccount("all");
    setDateFrom("");
    setDateTo("");
    setUnvalued(false);
    filtersChanged();
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
        error={error || action.error || selectError}
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
          account={account}
          onAccountChange={(value) => {
            setAccount(value);
            filtersChanged();
          }}
          accounts={accounts}
          dateFrom={dateFrom}
          dateTo={dateTo}
          onDatesChange={(from, to) => {
            setDateFrom(from);
            setDateTo(to);
            filtersChanged();
          }}
          unvalued={unvalued}
          onUnvaluedClear={() => {
            setUnvalued(false);
            filtersChanged();
          }}
          onClear={filtered ? clearFilters : undefined}
        />
        <LedgerTable
          data={data}
          loading={loading}
          loadingMore={loadingMore}
          remaining={remaining}
          onLoadMore={loadMore}
          loadMoreRef={sentinelRef}
          selected={selected}
          onSelectedChange={setSelected}
          allSelected={allSelected}
          onToggleAll={toggleAll}
          canGroup={canGroup}
          onOpenGroupModal={() => setModal("group")}
          onDeleteSelected={() => setDeleting(selected)}
          onAddToGroup={() => setModal("pick-group")}
          months={months}
          expanded={expanded}
          onExpandedChange={setExpanded}
          onEditRow={(row) => {
            setEditing(row);
            setEditCategory(row.category_key ?? "");
          }}
          onDissolveCase={setDissolve}
          onEditCase={(caseId) => {
            const group = data?.cases.find((item) => item.id === caseId);
            if (group) setGroupEdit({ group, add: [] });
          }}
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
          onDelete={() => {
            setDeleting([editing]);
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
      {modal === "group" && canGroup && (
        <GroupForm
          categories={categories}
          selected={selected}
          onClose={() => setModal(null)}
          action={action}
        />
      )}
      {modal === "pick-group" && (
        <PickGroupModal
          groups={data?.cases ?? []}
          count={selected.length}
          onClose={() => setModal(null)}
          onPick={(group) => {
            setModal(null);
            setGroupEdit({ group, add: selected });
          }}
        />
      )}
      {groupEdit && (
        <GroupForm
          categories={categories}
          selected={groupEdit.add}
          existing={groupEdit.group}
          onClose={() => setGroupEdit(null)}
          action={action}
        />
      )}
      {deleting && (
        <DeleteTransactionsModal rows={deleting} action={action} onClose={() => setDeleting(null)} />
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
