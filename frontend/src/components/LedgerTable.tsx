import { Fragment } from "react";
import {
  Banknote,
  ChevronDown,
  ChevronRight,
  Link2,
  ArrowLeft,
  ArrowRight,
  Unlink,
} from "lucide-react";
import CategoryIcon from "./CategoryIcon";
import type { LedgerData, Block } from "../domain";
import { money, monthLabel } from "../api";

function PageNavigation({
  page,
  pages,
  loading,
  onPageChange,
}: {
  page: number;
  pages: number;
  loading: boolean;
  onPageChange: (page: number) => void;
}) {
  return (
    <div className="flex items-center gap-3">
      <button
        className="inline-grid size-9 shrink-0 place-items-center rounded-lg text-muted transition hover:bg-accent-soft hover:text-accent"
        disabled={loading || page <= 1}
        aria-label="Poprzednia strona"
        onClick={() => onPageChange(page - 1)}
      >
        <ArrowLeft size={16} />
      </button>
      <span>
        {page} / {pages}
      </span>
      <button
        className="inline-grid size-9 shrink-0 place-items-center rounded-lg text-muted transition hover:bg-accent-soft hover:text-accent"
        disabled={loading || page >= pages}
        aria-label="Następna strona"
        onClick={() => onPageChange(page + 1)}
      >
        <ArrowRight size={16} />
      </button>
    </div>
  );
}

export default function LedgerTable({
  data,
  loading,
  page,
  onPageChange,
  selected,
  onSelectedChange,
  canGroup,
  onOpenGroupModal,
  canFund,
  onOpenFundModal,
  canSell,
  onOpenSellModal,
  months,
  expanded,
  onExpandedChange,
  onEditRow,
  onDissolveCase,
}: {
  data: LedgerData | null;
  loading: boolean;
  page: number;
  onPageChange: (page: number) => void;
  selected: number[];
  onSelectedChange: (selected: number[]) => void;
  canGroup: boolean;
  onOpenGroupModal: () => void;
  canFund: boolean;
  onOpenFundModal: () => void;
  canSell: boolean;
  onOpenSellModal: () => void;
  months: Map<string, Block[]>;
  expanded: string[];
  onExpandedChange: (expanded: string[]) => void;
  onEditRow: (row: Block) => void;
  onDissolveCase: (caseId: number) => void;
}) {
  const toggleGroup = (key: string) =>
    onExpandedChange(
      expanded.includes(key)
        ? expanded.filter((k) => k !== key)
        : [...expanded, key],
    );
  const openRow = (row: Block) =>
    row.case_id ? toggleGroup(row.key) : onEditRow(row);
  return (
    <>
      {selected.length > 0 && (
        <div className="card fixed inset-x-0 bottom-6 z-30 mx-auto flex w-fit max-w-[calc(100vw-2rem)] flex-wrap items-center gap-3 px-4 py-3 text-sm shadow-xl">
          <span>{selected.length} zaznaczone</span>
          <button
            className="btn"
            onClick={() => onSelectedChange([])}
          >
            Odznacz
          </button>
          <button
            className="btn-primary"
            disabled={!canGroup}
            onClick={onOpenGroupModal}
          >
            <Link2 size={16} />
            Połącz w grupę
          </button>
          <button
            className="btn"
            disabled={!canFund}
            onClick={onOpenFundModal}
          >
            <Banknote size={16} />
            Zasil portfel
          </button>
          {canSell && (
            <button
              className="btn"
              onClick={onOpenSellModal}
            >
              <Banknote size={16} />
              Odsprzedaj walutę
            </button>
          )}

        </div>
      )}
      <div className="min-w-0" aria-busy={loading}>
        {months.size > 0 && (
          <div className="card overflow-x-auto">
            <table
              aria-label="Transakcje"
              className="w-full min-w-[780px] table-fixed border-collapse text-sm [&_th]:px-3 [&_th]:py-3 [&_th]:text-left [&_th]:text-xs [&_th]:font-normal [&_th]:whitespace-nowrap [&_th]:text-muted [&_td]:border-t [&_td]:border-line/40 [&_td]:px-3 [&_td]:py-3.5 [&_td]:align-middle"
            >
              <colgroup>
                <col className="w-16" />
                <col />
                <col className="w-56" />
                <col className="w-44" />
                <col className="w-16" />
              </colgroup>
              <thead>
                <tr>
                  <th aria-label="Zaznaczenie" />
                  <th>Transakcja</th>
                  <th>Kategoria</th>
                  <th className="text-right!">Kwota</th>
                  <th />
                </tr>
              </thead>
              {[...months].map(([month, rows]) => (
                <tbody key={month}>
                  <tr>
                    <th
                      colSpan={5}
                      scope="rowgroup"
                      className="pt-6! text-sm! font-semibold! text-ink! capitalize"
                    >
                      {monthLabel(month)}
                    </th>
                  </tr>
                  {rows.map((row) => (
                    <Fragment key={row.key}>
                      <tr
                        className={`cursor-pointer transition-colors hover:bg-surface-muted/60 ${row.case_id ? "bg-accent-soft/60" : ""}`}
                        onClick={() => openRow(row)}
                      >
                        <td onClick={(event) => event.stopPropagation()}>
                          {row.case_id ? (
                            <button
                              className="inline-grid size-9 shrink-0 place-items-center rounded-lg text-muted transition hover:bg-accent-soft hover:text-accent"
                              aria-label={`Rozwiń grupę ${row.description}`}
                              aria-expanded={expanded.includes(row.key)}
                              onClick={() => toggleGroup(row.key)}
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
                                onSelectedChange(
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
                            className="text-left text-sm font-medium leading-relaxed wrap-anywhere hover:text-accent hover:underline [&_svg]:mr-1 [&_svg]:inline [&_svg]:align-middle"
                            onClick={(event) => {
                              event.stopPropagation();
                              openRow(row);
                            }}
                          >
                            {row.case_id && <Link2 size={14} />} {row.description}
                          </button>
                          <div className="mt-1 text-xs leading-relaxed text-muted">
                            {row.date} · {row.account}
                            {["PENDING", "PROCESSING"].includes(row.bank_status ?? "") && (
                              <span className="text-warning"> · Oczekująca</span>
                            )}
                            {row.counterparty && row.counterparty !== "—"
                              ? ` · ${row.counterparty}`
                              : ""}
                            {row.case_id ? ` · ${row.members.length} transakcje` : ""}
                          </div>
                        </td>
                        <td>
                          <span
                            className={`inline-flex max-w-64 items-center gap-2 text-xs leading-relaxed ${!row.category_key ? "text-warning" : "text-muted"}`}
                          >
                            <CategoryIcon categoryKey={row.category_key} />
                            {row.category_label}
                          </span>
                        </td>
                        <td
                          className={`text-right! font-medium whitespace-nowrap tabular-nums ${Number(row.case_id ? row.real_amount : row.amount) > 0 ? "text-success" : ""}`}
                        >
                          {row.valuation_missing ? "Brak wyceny" : money(
                            row.case_id ? row.real_amount : (row.amount ?? "0"),
                            row.currency,
                          )}
                          {row.case_id ? (
                            <small className="mt-1 block text-[10px] font-normal whitespace-normal text-muted">
                              Łącznie w bilansie
                            </small>
                          ) : row.category_key === "transfer_own" ? (
                            <small className="mt-1 block text-[10px] font-normal whitespace-normal text-muted">
                              Poza bilansem
                            </small>
                          ) : null}
                        </td>
                        <td onClick={(event) => event.stopPropagation()}>
                          {row.case_id ? (
                            <button
                              className="inline-grid size-9 shrink-0 place-items-center rounded-lg text-muted transition hover:bg-accent-soft hover:text-accent"
                              aria-label={`Rozwiąż grupę ${row.description}`}
                              onClick={() => onDissolveCase(row.case_id!)}
                            >
                              <Unlink size={16} />
                            </button>
                          ) : (
                            <button
                              className="inline-grid size-9 shrink-0 place-items-center rounded-lg text-muted transition hover:bg-accent-soft hover:text-accent"
                              aria-label={`Edytuj ${row.description}`}
                              onClick={() => onEditRow(row)}
                            >
                              <ChevronRight size={17} />
                            </button>
                          )}
                        </td>
                      </tr>
                      {expanded.includes(row.key) &&
                        row.members.map((member) => (
                          <tr
                            className="bg-surface-muted text-muted [&_td]:py-3! [&_td:nth-child(2)]:pl-8!"
                            key={member.id}
                          >
                            <td />
                            <td>
                              <span>{member.description}</span>
                              <div className="mt-1 text-xs leading-relaxed text-muted">
                                {member.date} · {member.account}
                                {member.counterparty !== "—"
                                  ? ` · ${member.counterparty}`
                                  : ""}
                              </div>
                            </td>
                            <td />
                            <td className="text-right! font-medium whitespace-nowrap tabular-nums">
                              {money(member.amount, member.currency)}
                            </td>
                            <td />
                          </tr>
                        ))}
                    </Fragment>
                  ))}
                </tbody>
              ))}
            </table>
          </div>
        )}
        {!data && loading && (
          <div className="flex min-h-48 flex-col items-center justify-center gap-4 p-6 text-center text-sm text-muted">
            Wczytuję transakcje…
          </div>
        )}
        {data && !data.blocks.length && (
          <div className="flex min-h-48 flex-col items-center justify-center gap-4 p-6 text-center text-sm text-muted">
            Brak transakcji pasujących do filtrów.
          </div>
        )}
      </div>
      <footer className="flex items-center justify-end gap-6 py-4 text-xs text-muted [&>div]:flex [&>div]:items-center [&>div]:gap-3">
        <span>
          {data && data.total
            ? `${(data.page - 1) * data.page_size + 1}–${(data.page - 1) * data.page_size + data.blocks.length} z ${data.total}`
            : "0"}
        </span>
        <PageNavigation
          page={data?.page ?? page}
          pages={data?.pages ?? 1}
          loading={loading}
          onPageChange={onPageChange}
        />
      </footer>
    </>
  );
}
