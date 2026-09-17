import * as Accordion from "@radix-ui/react-accordion";
import { Fragment } from "react";
import { ChevronDown, ChevronRight, Link2, ArrowLeft, ArrowRight, Unlink } from "lucide-react";
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
  months,
  closedMonths,
  onClosedMonthsChange,
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
  months: Map<string, Block[]>;
  closedMonths: string[];
  onClosedMonthsChange: (months: string[]) => void;
  expanded: string[];
  onExpandedChange: (expanded: string[]) => void;
  onEditRow: (row: Block) => void;
  onDissolveCase: (caseId: number) => void;
}) {
  return (
    <>
      {selected.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 border-b border-line bg-accent-soft px-4 py-3 text-sm">
          <span>{selected.length} zaznaczone</span>
          <button
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-line bg-surface px-4 py-2.5 text-sm font-medium shadow-sm transition hover:border-accent/30 hover:bg-accent-soft"
            onClick={() => onSelectedChange([])}
          >
            Odznacz
          </button>
          <button
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-line bg-surface px-4 py-2.5 text-sm font-medium shadow-sm transition hover:border-accent/30 hover:bg-accent-soft border-accent! bg-accent! text-white! shadow-accent/15 hover:bg-accent-hover!"
            disabled={!canGroup}
            onClick={onOpenGroupModal}
          >
            <Link2 size={16} />
            Połącz w grupę
          </button>
          {selected.length > 1 && !canGroup && (
            <small>Wybierz transakcje w jednej walucie.</small>
          )}
        </div>
      )}
      <div className="flex items-center justify-between gap-3 border-b border-line py-3 text-xs text-muted">
        <span>{data ? `${data.total} pozycji` : "Transakcje"}</span>
        <PageNavigation
          page={data?.page ?? page}
          pages={data?.pages ?? 1}
          loading={loading}
          onPageChange={onPageChange}
        />
      </div>
      <div className="min-w-0" aria-busy={loading}>
        <Accordion.Root
          type="multiple"
          value={[...months.keys()].filter((month) => !closedMonths.includes(month))}
          onValueChange={(open) =>
            onClosedMonthsChange([
              ...closedMonths.filter((month) => !months.has(month)),
              ...[...months.keys()].filter((month) => !open.includes(month)),
            ])
          }
        >
          {[...months].map(([month, rows]) => (
            <Accordion.Item
              key={month}
              value={month}
              className="border-b border-line last:border-0"
            >
              <Accordion.Header>
                <Accordion.Trigger className="group flex w-full items-center justify-between gap-3 py-4 text-left text-sm font-semibold text-ink hover:text-accent">
                  <span className="capitalize">{monthLabel(month)}</span>
                  <span className="ml-auto text-xs font-normal text-muted">
                    {rows.length} pozycji na tej stronie
                  </span>
                  <ChevronDown
                    size={17}
                    className="shrink-0 text-accent transition-transform group-data-[state=open]:rotate-180 motion-reduce:transition-none"
                  />
                </Accordion.Trigger>
              </Accordion.Header>
              <Accordion.Content className="overflow-hidden data-[state=open]:animate-accordion-down data-[state=closed]:animate-accordion-up motion-reduce:animate-none">
                <div className="overflow-x-auto">
                  <table
                    aria-label={`Transakcje: ${monthLabel(month)}`}
                    className="w-full min-w-[780px] table-fixed border-collapse text-sm [&_th]:px-3 [&_th]:py-3 [&_th]:text-left [&_th]:text-xs [&_th]:font-medium [&_th]:whitespace-nowrap [&_th]:text-muted [&_td]:border-t [&_td]:border-line/70 [&_td]:px-3 [&_td]:py-3.5 [&_td]:align-middle"
                  >
                    <colgroup>
                      <col className="w-16" />
                      <col />
                      <col className="w-48" />
                      <col className="w-44" />
                      <col className="w-16" />
                    </colgroup>
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
                      {rows.map((row) => (
                        <Fragment key={row.key}>
                          <tr className={row.case_id ? "bg-accent-soft/60" : ""}>
                            <td>
                              {row.case_id ? (
                                <button
                                  className="inline-grid size-9 shrink-0 place-items-center rounded-lg text-muted transition hover:bg-accent-soft hover:text-accent"
                                  aria-label={`Rozwiń grupę ${row.description}`}
                                  aria-expanded={expanded.includes(row.key)}
                                  onClick={() =>
                                    onExpandedChange(
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
                                onClick={() => {
                                  if (row.case_id)
                                    onExpandedChange(
                                      expanded.includes(row.key)
                                        ? expanded.filter((k) => k !== row.key)
                                        : [...expanded, row.key],
                                    );
                                  else onEditRow(row);
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
                              {money(
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
                            <td>
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
                                  <small className="mt-1 block text-[10px] font-normal whitespace-normal text-muted">
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
                </div>
              </Accordion.Content>
            </Accordion.Item>
          ))}
        </Accordion.Root>
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
      <footer className="flex items-center justify-between gap-3 border-t border-line py-4 text-xs text-muted [&>div]:flex [&>div]:items-center [&>div]:gap-3">
        <span>
          {data && data.total
            ? `${(data.page - 1) * data.page_size + 1}–${(data.page - 1) * data.page_size + data.blocks.length} z ${data.total}`
            : "0"}{" "}
          pozycji
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
