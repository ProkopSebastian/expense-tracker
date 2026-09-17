import CategoryIcon from "../components/CategoryIcon";
import AppSelect from "../components/AppSelect";
import * as Accordion from "@radix-ui/react-accordion";
import * as Tabs from "@radix-ui/react-tabs";
import * as Popover from "@radix-ui/react-popover";
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
import { money, monthLabel } from "../api";
import {
  CategorySelect,
  buildCategoryTree,
  type CategoryNode,
  Modal,
  Notice,
} from "../components/Forms";
import { ManualForm, GroupForm } from "../components/TransactionForms";

function CategoryFilterNode({
  node,
  depth,
  selected,
  onToggle,
}: {
  node: CategoryNode;
  depth: number;
  selected: string[];
  onToggle: (key: string, checked: boolean) => void;
}) {
  return (
    <div className={depth === 0 ? "border-b border-line py-1 last:border-0" : undefined}>
      <label
        className={`flex items-center gap-2 rounded-lg p-2 text-sm ${depth === 0 ? "font-medium" : "text-muted"}`}
        style={depth ? { paddingLeft: `${depth * 1.5 + 0.5}rem` } : undefined}
      >
        <input
          type="checkbox"
          checked={selected.includes(node.category.key)}
          onChange={(e) => onToggle(node.category.key, e.target.checked)}
        />
        <CategoryIcon
          categoryKey={node.category.key}
          customIcon={node.category.icon}
          customColor={node.category.color}
        />
        {node.category.label}
      </label>
      {node.children.map((child) => (
        <CategoryFilterNode
          key={child.category.key}
          node={child}
          depth={depth + 1}
          selected={selected}
          onToggle={onToggle}
        />
      ))}
    </div>
  );
}

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
      {!!(data?.relations.length || data?.cases.length) && (
        <details className="mb-6">
          <summary className="group flex items-center justify-between gap-3 border-y border-line py-3 text-sm font-medium hover:text-accent">
            <span>
              Powiązania i grupy
              {data.relations.length > 0 && (
                <span className="ml-2 text-xs font-normal text-muted">
                  {data.relations.length} sugestii
                </span>
              )}
            </span>
            <ChevronDown
              size={17}
              className="shrink-0 text-muted transition-transform group-open:rotate-180 motion-reduce:transition-none"
            />
          </summary>
          <Tabs.Root
            value={linksTab}
            onValueChange={(value) =>
              setLinksTab(value as "relations" | "groups")
            }
            className="pt-4"
          >
            <Tabs.List
              className="mb-3 flex w-fit flex-wrap gap-1 rounded-xl bg-surface-muted p-1 [&_button]:flex [&_button]:items-center [&_button]:gap-2 [&_button]:rounded-lg [&_button]:px-3 [&_button]:py-2 [&_button]:text-sm [&_button[data-state=active]]:bg-surface [&_button[data-state=active]]:text-accent [&_button[data-state=active]]:shadow-sm"
              aria-label="Powiązania"
            >
              <Tabs.Trigger value="relations">
                Sugerowane powiązania{" "}
                <span className="ml-1 rounded-md bg-accent-soft px-1.5 py-0.5 text-xs tracking-normal text-accent">
                  {data?.relations.length ?? 0}
                </span>
              </Tabs.Trigger>
              <Tabs.Trigger value="groups">
                Twoje grupy{" "}
                <span className="ml-1 rounded-md bg-accent-soft px-1.5 py-0.5 text-xs tracking-normal text-accent">
                  {data?.cases.length ?? 0}
                </span>
              </Tabs.Trigger>
            </Tabs.List>
            <Tabs.Content value={linksTab}>
              {linksTab === "relations" ? (
                data?.relations.length ? (
                  data.relations.map((s) => (
                    <article
                      className="flex flex-col justify-between gap-4 border-b border-line py-5 last:border-0 sm:flex-row sm:items-center [&_p]:my-2 [&_p]:max-w-3xl [&_p]:text-sm [&_p]:leading-relaxed [&_p]:text-muted [&_small]:text-xs [&_small]:text-muted"
                      key={s.id}
                    >
                      <div>
                        <strong>{s.payload.title}</strong>
                        <p>{s.payload.rationale}</p>
                        <small>
                          {s.payload.transaction_ids.length} transakcje · Twój
                          koszt:{" "}
                          {money(s.payload.personal_amount, s.payload.currency)}
                        </small>
                      </div>
                      <div className="flex shrink-0 flex-wrap items-center gap-2">
                        <button
                          className="inline-flex items-center justify-center gap-2 rounded-xl border border-line bg-surface px-4 py-2.5 text-sm font-medium shadow-sm transition hover:border-accent/30 hover:bg-accent-soft"
                          disabled={action.busy}
                          onClick={() =>
                            action.run(
                              () =>
                                request(`/suggestions/${s.id}/reject`, "POST"),
                              "Sugestia odrzucona.",
                            )
                          }
                        >
                          Odrzuć
                        </button>
                        <button
                          className="inline-flex items-center justify-center gap-2 rounded-xl border border-line bg-surface px-4 py-2.5 text-sm font-medium shadow-sm transition hover:border-accent/30 hover:bg-accent-soft border-accent! bg-accent! text-white! shadow-accent/15 hover:bg-accent-hover!"
                          disabled={action.busy}
                          onClick={() =>
                            action.run(
                              () =>
                                request(`/suggestions/${s.id}/approve`, "POST"),
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
                  <p className="text-sm leading-relaxed text-muted">
                    Brak sugerowanych powiązań.
                  </p>
                )
              ) : data?.cases.length ? (
                data.cases.map((c) => (
                  <div
                    className="flex flex-col justify-between gap-4 border-b border-line py-5 last:border-0 sm:flex-row sm:items-center [&_p]:my-2 [&_p]:max-w-3xl [&_p]:text-sm [&_p]:leading-relaxed [&_p]:text-muted [&_small]:text-xs [&_small]:text-muted"
                    key={c.id}
                  >
                    <span>
                      {c.title} · {money(c.personal_amount, c.currency)}
                    </span>
                    <button
                      className="inline-flex items-center justify-center gap-2 rounded-xl border border-line bg-surface px-4 py-2.5 text-sm font-medium shadow-sm transition hover:border-accent/30 hover:bg-accent-soft"
                      onClick={() => setDissolve(c.id)}
                    >
                      Rozwiąż grupę
                    </button>
                  </div>
                ))
              ) : (
                <p className="text-sm leading-relaxed text-muted">
                  Nie masz jeszcze żadnych grup.
                </p>
              )}
            </Tabs.Content>
          </Tabs.Root>
        </details>
      )}
      <section className="mb-6 border-t border-line">
        <div className="flex flex-wrap items-center gap-3 border-b border-line py-4">
          <label className="flex min-w-56 flex-1 items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2 text-muted [&_input]:w-full [&_input]:min-w-0 [&_input]:border-0 [&_input]:bg-transparent [&_input]:p-0">
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
          <AppSelect
            ariaLabel="Kierunek"
            value={direction}
            onValueChange={(value) => {
              setDirection(value);
              filtersChanged();
            }}
            options={[
              { value: "all", label: "Wszystkie przepływy" },
              { value: "expense", label: "Wydatki" },
              { value: "income", label: "Wpływy" },
            ]}
          />
          <Popover.Root>
            <Popover.Trigger className="rounded-xl border border-line bg-surface px-3 py-2.5 text-sm hover:bg-accent-soft">
              Kategorie{category.length ? ` (${category.length})` : ""}
            </Popover.Trigger>
            <Popover.Portal>
              <Popover.Content
                align="end"
                sideOffset={8}
                className="z-40 max-h-[min(360px,70dvh)] w-72 max-w-[calc(100vw-2rem)] overflow-y-auto rounded-xl border border-line bg-surface p-3 shadow-xl [&>label]:flex [&>label]:items-center [&>label]:gap-2 [&>label]:p-2"
              >
                {categoryTree.map((node) => (
                  <CategoryFilterNode
                    key={node.category.key}
                    node={node}
                    depth={0}
                    selected={category}
                    onToggle={(key, checked) => {
                      setCategory(
                        checked
                          ? [...category, key]
                          : category.filter((existing) => existing !== key),
                      );
                      filtersChanged();
                    }}
                  />
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
                  <CategoryIcon /> Do przypisania
                </label>
                <button
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-line bg-surface px-4 py-2.5 text-sm font-medium shadow-sm transition hover:border-accent/30 hover:bg-accent-soft"
                  onClick={() => {
                    setCategory([]);
                    filtersChanged();
                  }}
                >
                  Wyczyść
                </button>
              </Popover.Content>
            </Popover.Portal>
          </Popover.Root>
        </div>
        {selected.length > 0 && (
          <div className="flex flex-wrap items-center gap-3 border-b border-line bg-accent-soft px-4 py-3 text-sm">
            <span>{selected.length} zaznaczone</span>
            <button
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-line bg-surface px-4 py-2.5 text-sm font-medium shadow-sm transition hover:border-accent/30 hover:bg-accent-soft"
              onClick={() => setSelected([])}
            >
              Odznacz
            </button>
            <button
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-line bg-surface px-4 py-2.5 text-sm font-medium shadow-sm transition hover:border-accent/30 hover:bg-accent-soft border-accent! bg-accent! text-white! shadow-accent/15 hover:bg-accent-hover!"
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
        <div className="flex items-center justify-between gap-3 border-b border-line py-3 text-xs text-muted">
          <span>{data ? `${data.total} pozycji` : "Transakcje"}</span>
          <PageNavigation
            page={data?.page ?? page}
            pages={data?.pages ?? 1}
            loading={loading}
            onPageChange={changePage}
          />
        </div>
        <div className="min-w-0" aria-busy={loading}>
          <Accordion.Root
            type="multiple"
            value={[...months.keys()].filter(
              (month) => !closedMonths.includes(month),
            )}
            onValueChange={(open) =>
              setClosedMonths([
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
                            <tr
                              className={row.case_id ? "bg-accent-soft/60" : ""}
                            >
                              <td>
                                {row.case_id ? (
                                  <button
                                    className="inline-grid size-9 shrink-0 place-items-center rounded-lg text-muted transition hover:bg-accent-soft hover:text-accent"
                                    aria-label={`Rozwiń grupę ${row.description}`}
                                    aria-expanded={expanded.includes(row.key)}
                                    onClick={() =>
                                      setExpanded(
                                        expanded.includes(row.key)
                                          ? expanded.filter(
                                              (k) => k !== row.key,
                                            )
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
                                          : selected.filter(
                                              (id) => id !== row.id,
                                            ),
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
                                      setExpanded(
                                        expanded.includes(row.key)
                                          ? expanded.filter(
                                              (k) => k !== row.key,
                                            )
                                          : [...expanded, row.key],
                                      );
                                    else {
                                      setEditing(row);
                                      setEditCategory(row.category_key ?? "");
                                    }
                                  }}
                                >
                                  {row.case_id && <Link2 size={14} />}{" "}
                                  {row.description}
                                </button>
                                <div className="mt-1 text-xs leading-relaxed text-muted">
                                  {row.date} · {row.account}
                                  {["PENDING", "PROCESSING"].includes(
                                    row.bank_status ?? "",
                                  ) && (
                                    <span className="text-warning">
                                      {" "}
                                      · Oczekująca
                                    </span>
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
                                  className={`inline-flex max-w-64 items-center gap-2 text-xs leading-relaxed ${!row.category_key ? "text-warning" : "text-muted"}`}
                                >
                                  <CategoryIcon
                                    categoryKey={row.category_key}
                                  />
                                  {row.category_label}
                                </span>
                              </td>
                              <td
                                className={`text-right! font-medium whitespace-nowrap tabular-nums ${Number(row.case_id ? row.real_amount : row.amount) > 0 ? "text-success" : ""}`}
                              >
                                {money(
                                  row.case_id
                                    ? row.real_amount
                                    : (row.amount ?? "0"),
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
                                    onClick={() => setDissolve(row.case_id)}
                                  >
                                    <Unlink size={16} />
                                  </button>
                                ) : (
                                  <button
                                    className="inline-grid size-9 shrink-0 place-items-center rounded-lg text-muted transition hover:bg-accent-soft hover:text-accent"
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
            onPageChange={changePage}
          />
        </footer>
      </section>
      {editing && (
        <Modal
          title="Zmień kategorię"
          onClose={() => setEditing(null)}
          busy={action.busy}
        >
          <form
            className="flex flex-col gap-5 p-5 sm:p-6 [&>p]:text-sm [&>p]:leading-relaxed [&_label]:flex [&_label]:flex-col [&_label]:gap-2 [&_label]:text-sm [&_label_small]:text-xs [&_label_small]:text-muted [&_summary]:cursor-pointer [&_summary]:text-sm [&_details_label]:mt-3"
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
            <p className="text-sm leading-relaxed text-muted">
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
            <footer className="flex flex-wrap justify-end gap-2 border-t border-line pt-5">
              <button
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-line bg-surface px-4 py-2.5 text-sm font-medium shadow-sm transition hover:border-accent/30 hover:bg-accent-soft border-accent! bg-accent! text-white! shadow-accent/15 hover:bg-accent-hover!"
                disabled={action.busy}
              >
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
          <div className="flex flex-col gap-5 p-5 sm:p-6 [&>p]:text-sm [&>p]:leading-relaxed [&_label]:flex [&_label]:flex-col [&_label]:gap-2 [&_label]:text-sm [&_label_small]:text-xs [&_label_small]:text-muted [&_summary]:cursor-pointer [&_summary]:text-sm [&_details_label]:mt-3">
            <Notice error={action.error} />
            <p>
              Transakcje zostaną w historii i znów będą liczone osobno. Możesz
              później utworzyć z nich nową grupę.
            </p>
            <footer className="flex flex-wrap justify-end gap-2 border-t border-line pt-5">
              <button
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-line bg-surface px-4 py-2.5 text-sm font-medium shadow-sm transition hover:border-accent/30 hover:bg-accent-soft"
                onClick={() => setDissolve(null)}
              >
                Anuluj
              </button>
              <button
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-line bg-surface px-4 py-2.5 text-sm font-medium shadow-sm transition hover:border-accent/30 hover:bg-accent-soft border-accent! bg-accent! text-white! shadow-accent/15 hover:bg-accent-hover!"
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
