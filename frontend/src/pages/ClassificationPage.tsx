import { useCallback, useState, useTransition } from "react";
import * as Popover from "@radix-ui/react-popover";
import { Sparkles, Check, ChevronDown, Link2, LoaderCircle, Search, X } from "lucide-react";
import type { Category, ClassificationRow, Relation } from "../domain";
import { request, useResource, useAction, useLoadMoreSentinel } from "../hooks";
import { money } from "../api";
import { CategorySelect, Notice } from "../components/Forms";
import HelpPopover from "../components/HelpPopover";

const CLASSIFICATION_PAGE_SIZE = 25;

function formatSignedAmount(value: number, currency: string) {
  const sign = value < 0 ? "−" : value > 0 ? "+" : "";
  return `${sign} ${money(Math.abs(value), currency)}`.trim();
}

function transactionDirection(totals: Record<string, string>) {
  const values = Object.values(totals).map(Number);
  if (
    values.every((value) => value <= 0) &&
    values.some((value) => value < 0)
  ) {
    return "expense";
  }
  if (
    values.every((value) => value >= 0) &&
    values.some((value) => value > 0)
  ) {
    return "income";
  }
  return "mixed";
}

function StatBadge({ label, value }: { label: string; value: number }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-lg bg-accent-soft px-3 py-1.5 text-sm text-muted">
      <strong className="font-semibold text-accent">{value}</strong>
      {label}
    </span>
  );
}

const ITEM_COLUMNS =
  "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 px-5 lg:grid-cols-[minmax(0,2fr)_8rem_minmax(12rem,1.3fr)_5rem] lg:gap-x-6";
const APPROVE_BUTTON_CLASS =
  "inline-flex items-center justify-center gap-1.5 rounded-lg bg-accent-soft px-3 py-1.5 text-sm font-medium text-accent transition hover:bg-accent hover:text-white";
const ICON_APPROVE_CLASS =
  "inline-grid size-8 place-items-center rounded-lg text-accent transition hover:bg-accent hover:text-white disabled:text-muted disabled:hover:bg-transparent";
const REJECT_BUTTON_CLASS =
  "inline-grid size-8 place-items-center rounded-lg text-muted transition hover:bg-danger/10 hover:text-danger";

function ClassificationItem({
  row,
  categories,
  onChanged,
}: {
  row: ClassificationRow;
  categories: Category[];
  onChanged: () => void;
}) {
  const [category, setCategory] = useState(row.category_key ?? ""),
    [remember, setRemember] = useState(row.remember);
  const action = useAction(onChanged);
  const income = transactionDirection(row.totals) === "income";
  const amount = Object.entries(row.totals)
    .map(([currency, total]) => formatSignedAmount(Number(total), currency))
    .join(" / ");
  return (
    <article className={`${ITEM_COLUMNS} py-3`}>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <strong className="text-sm font-medium leading-relaxed wrap-anywhere">
            {row.description}
          </strong>
          {row.suggestion_id && (
            <Popover.Root>
              <Popover.Trigger
                className="inline-flex items-center gap-1 rounded text-xs whitespace-nowrap text-muted hover:text-accent disabled:hover:text-muted"
                aria-label="Dlaczego ta kategoria?"
                disabled={!row.rationale}
              >
                <Sparkles size={13} className="text-accent" />
                {row.confidence !== null
                  ? `${Math.round(row.confidence * 100)}%`
                  : "AI"}
                {row.rationale && <ChevronDown size={13} />}
              </Popover.Trigger>
              <Popover.Portal>
                <Popover.Content
                  align="start"
                  sideOffset={6}
                  className="z-50 w-80 max-w-[calc(100vw-2rem)] rounded-xl border border-line bg-surface p-4 text-sm leading-relaxed text-muted shadow-xl"
                >
                  {row.rationale}
                </Popover.Content>
              </Popover.Portal>
            </Popover.Root>
          )}
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-1 text-xs leading-relaxed text-muted">
          {row.date}
          {row.count > 1 && row.members && (
            <Popover.Root>
              <Popover.Trigger className="inline-flex items-center gap-0.5 rounded hover:text-accent">
                · {row.count} transakcje
                <ChevronDown size={13} />
              </Popover.Trigger>
              <Popover.Portal>
                <Popover.Content
                  align="start"
                  sideOffset={6}
                  className="z-50 w-64 rounded-xl border border-line bg-surface p-3 text-sm shadow-xl"
                >
                  <ul className="space-y-1.5">
                    {row.members.map((member, index) => (
                      <li key={index} className="flex justify-between gap-3">
                        <span className="text-muted">{member.date}</span>
                        <span className="tabular-nums">
                          {formatSignedAmount(Number(member.amount), member.currency)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </Popover.Content>
              </Popover.Portal>
            </Popover.Root>
          )}
          {row.counterparty !== "—" ? ` · ${row.counterparty}` : ""}
        </div>
        <Notice error={action.error} />
      </div>
      <div className="text-right">
        <strong
          className={`text-sm font-semibold tabular-nums wrap-anywhere ${income ? "text-success" : ""}`}
          aria-label={`Kwota transakcji: ${amount}`}
        >
          {amount}
        </strong>
      </div>
      <div className="col-span-2 flex min-w-0 lg:col-span-1 [&>span]:w-full">
        <CategorySelect
          inline
          categories={categories}
          value={category}
          onChange={setCategory}
          label={`Kategoria ${row.description}`}
          remember={remember}
          onRememberChange={setRemember}
        />
      </div>
      <div className="col-span-2 flex items-center gap-1 lg:col-span-1 lg:justify-end">
        <button
          className={ICON_APPROVE_CLASS}
          disabled={!category || action.busy}
          aria-label={`${row.suggestion_id ? "Zatwierdź" : "Przypisz"} kategorię dla ${row.description}`}
          title={row.suggestion_id ? "Zatwierdź" : "Przypisz"}
          onClick={() =>
            action.run(() =>
              request(
                row.suggestion_id
                  ? `/suggestions/${row.suggestion_id}/approve`
                  : `/transactions/${row.transaction_id}/category`,
                row.suggestion_id ? "POST" : "PUT",
                { category_key: category, remember },
              ),
            )
          }
        >
          <Check size={17} />
        </button>
        {row.suggestion_id && (
          <button
            className={REJECT_BUTTON_CLASS}
            disabled={action.busy}
            aria-label={`Odrzuć sugestię dla ${row.description}`}
            title="Odrzuć"
            onClick={() =>
              action.run(() =>
                request(`/suggestions/${row.suggestion_id}/reject`, "POST"),
              )
            }
          >
            <X size={16} />
          </button>
        )}
      </div>
    </article>
  );
}

function RelationSuggestion({
  relation,
  onChanged,
}: {
  relation: Relation;
  onChanged: () => void;
}) {
  const action = useAction(onChanged);
  return (
    <article className="flex flex-col justify-between gap-3 px-5 py-4 sm:flex-row sm:items-start">
      <div className="min-w-0">
        <strong className="text-sm font-medium">{relation.payload.title}</strong>
        <ul className="mt-2 space-y-1 text-sm">
          {relation.members.map((member) => (
            <li
              key={member.id}
              className="grid grid-cols-[5.5rem_minmax(0,16rem)_7rem] justify-start gap-x-4"
            >
              <span className="text-muted tabular-nums">
                {member.date.split("-").reverse().join(".")}
              </span>
              <span className="truncate">{member.description}</span>
              <span
                className={`text-right tabular-nums ${Number(member.amount) > 0 ? "text-success" : ""}`}
              >
                {formatSignedAmount(Number(member.amount), member.currency)}
              </span>
            </li>
          ))}
        </ul>
        <p
          className="mt-2 flex max-w-2xl gap-2 text-sm leading-relaxed text-muted"
          title={relation.payload.rationale}
        >
          <Sparkles size={14} className="mt-1 shrink-0 text-accent" aria-label="Uzasadnienie AI" />
          <span className="line-clamp-2">{relation.payload.rationale}</span>
        </p>
        <p className="mt-2 text-xs text-muted">
          {relation.payload.kind === "own_transfer"
            ? "Nie liczy się do wydatków ani wpływów."
            : `W podsumowaniu jako jeden wydatek: ${money(relation.payload.personal_amount, relation.payload.currency)}.`}
        </p>
        <Notice error={action.error} />
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <button
          className={APPROVE_BUTTON_CLASS}
          disabled={action.busy}
          onClick={() =>
            action.run(
              () => request(`/suggestions/${relation.id}/approve`, "POST"),
              "Grupa utworzona.",
            )
          }
        >
          <Link2 size={15} />
          Połącz
        </button>
        <button
          className={REJECT_BUTTON_CLASS}
          disabled={action.busy}
          aria-label={`Odrzuć powiązanie ${relation.payload.title}`}
          title="Odrzuć"
          onClick={() =>
            action.run(
              () => request(`/suggestions/${relation.id}/reject`, "POST"),
              "Sugestia odrzucona.",
            )
          }
        >
          <X size={16} />
        </button>
      </div>
    </article>
  );
}

export default function ClassificationPage({
  categories,
  aiEnabled,
  revision,
  onChanged,
}: {
  categories: Category[];
  aiEnabled: boolean;
  revision: number;
  onChanged: () => void;
}) {
  const { data, error, loading } = useResource<{ rows: ClassificationRow[]; relations: Relation[] }>(
    "/classification",
    revision,
  );
  const action = useAction(onChanged);
  const [notice, setNotice] = useState(""),
    [merchantStats, setMerchantStats] = useState<{
      processed: number;
      saved: number;
      remaining: number;
      searches: number;
    } | null>(null),
    [activeKind, setActiveKind] = useState<"merchants" | "relations" | null>(
      null,
    ),
    [query, setQuery] = useState(""),
    [visibleRowsCount, setVisibleRowsCount] = useState(
      CLASSIFICATION_PAGE_SIZE,
    );
  const [isLoadingMore, startLoadingMore] = useTransition();
  async function analyze(kind: "merchants" | "relations") {
    setNotice("");
    setMerchantStats(null);
    setActiveKind(kind);
    await action.run(async () => {
      const result = await request<{
        saved: number;
        groups_processed?: number;
        groups_remaining?: number;
        web_searches?: number;
      }>(`/ai/${kind}`, "POST");
      if (kind === "merchants") {
        setMerchantStats({
          processed: result.groups_processed ?? 0,
          saved: result.saved,
          remaining: result.groups_remaining ?? 0,
          searches: result.web_searches ?? 0,
        });
      } else {
        setNotice(
          `Nowe sugestie powiązań: ${result.saved}.`,
        );
      }
    }, "Analiza zakończona.");
  }
  const rows =
    data?.rows.filter((row) =>
      `${row.description} ${row.counterparty}`
        .toLocaleLowerCase()
        .includes(query.toLocaleLowerCase()),
    ) ?? [];
  const suggestions = rows.filter((row) => row.suggestion_id);
  const confident = suggestions.filter(
    (row) => (row.confidence ?? 0) >= 0.9 && row.category_key,
  );
  const bulk = useAction(onChanged);
  function approveConfident() {
    bulk.run(
      () =>
        request("/suggestions/approve-all", "POST", {
          items: confident.map((row) => ({
            id: row.suggestion_id,
            category_key: row.category_key,
            remember: row.remember,
          })),
        }),
      `Zatwierdzono ${confident.length} sugestii.`,
    );
  }
  const unclassified = rows.filter((row) => !row.suggestion_id);
  const visibleRows = [...suggestions, ...unclassified].slice(
    0,
    visibleRowsCount,
  );
  const remainingRowsCount = rows.length - visibleRows.length;
  const loadMore = useCallback(
    () =>
      startLoadingMore(() =>
        setVisibleRowsCount((count) => count + CLASSIFICATION_PAGE_SIZE),
      ),
    [startLoadingMore],
  );
  const sentinelRef = useLoadMoreSentinel(
    loadMore,
    remainingRowsCount > 0 && !isLoadingMore,
  );
  const groups = [
    {
      title: "Sugestie AI",
      count: suggestions.length,
      bulk: confident.length > 0,
      rows: visibleRows.filter((row) => row.suggestion_id),
    },
    {
      title: "Bez kategorii",
      count: unclassified.length,
      bulk: false,
      rows: visibleRows.filter((row) => !row.suggestion_id),
    },
  ];
  return (
    <>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-baseline gap-3">
          <h1>Do klasyfikacji</h1>
          <span className="text-sm text-muted" role="status">
            {loading && !data
              ? "Wczytuję…"
              : (data?.rows.length ?? 0) + (data?.relations.length ?? 0)}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex w-full items-center sm:w-64 gap-2 rounded-lg border border-line bg-surface px-3 py-2 text-muted [&_input]:w-full [&_input]:min-w-0 [&_input]:border-0 [&_input]:bg-transparent [&_input]:p-0">
            <Search size={16} />
            <input
              aria-label="Szukaj do klasyfikacji"
              placeholder="Szukaj sprzedawcy"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setVisibleRowsCount(CLASSIFICATION_PAGE_SIZE);
              }}
            />
          </label>
          <button
            className="btn-primary"
            disabled={
              !aiEnabled ||
              action.busy ||
              !data?.rows.some((row) => row.transaction_id)
            }
            onClick={() => analyze("merchants")}
          >
            <Sparkles size={15} />
            {action.busy && activeKind === "merchants"
              ? "Analiza trwa…"
              : "Zaproponuj kategorie"}
          </button>
          <Popover.Root>
            <Popover.Trigger className="btn">
              Narzędzia AI
            </Popover.Trigger>
            <Popover.Portal>
              <Popover.Content
                align="end"
                sideOffset={6}
                className="z-40 w-80 max-w-[calc(100vw-2rem)] rounded-xl border border-line bg-surface p-4 text-sm shadow-xl"
              >
                <h2>Znajdź powiązania</h2>
                <p className="mt-2 leading-relaxed text-muted">
                  Wspólne zakupy, zwroty i rozliczenia. Propozycje pojawią się
                  na tej stronie do zatwierdzenia.
                </p>
                <Popover.Close asChild>
                  <button
                    className="btn mt-4"
                    disabled={!aiEnabled || action.busy}
                    onClick={() => analyze("relations")}
                  >
                    Wykryj powiązania
                  </button>
                </Popover.Close>
                <p className="mt-4 border-t border-line pt-3 text-xs leading-relaxed text-muted">
                  Analiza obejmuje do 100 najnowszych transakcji poza grupami.
                </p>
              </Popover.Content>
            </Popover.Portal>
          </Popover.Root>
          <HelpPopover label="Jak działa AI">
            {aiEnabled
              ? "AI analizuje dane dopiero po kliknięciu. Rozpoznawanie może korzystać z internetu."
              : "Aby korzystać z AI, dodaj klucz API w Ustawieniach."}
          </HelpPopover>
        </div>
      </div>
      <Notice
        error={error || bulk.error}
        notice={bulk.notice}
      />
      {activeKind && <Notice error={action.error} notice={notice} />}
      {merchantStats && (
        <div className="mb-6 flex flex-wrap gap-2">
          <StatBadge label="Sprawdzono sprzedawców" value={merchantStats.processed} />
          <StatBadge label="Nowe sugestie" value={merchantStats.saved} />
          <StatBadge label="Pozostało" value={merchantStats.remaining} />
          <StatBadge label="Wyszukiwania w internecie" value={merchantStats.searches} />
        </div>
      )}
      <div className="mb-6">
        {(data?.relations.length ?? 0) > 0 && (
          <section className="card mb-6 overflow-hidden">
            <h2 className="flex items-baseline gap-2 px-5 pt-4 pb-1 text-base">
              Powiązania do zatwierdzenia
              <span className="text-sm font-normal text-muted">
                {data!.relations.length}
              </span>
            </h2>
            <div className="divide-y divide-line/40">
              {data!.relations.map((relation) => (
                <RelationSuggestion
                  key={relation.id}
                  relation={relation}
                  onChanged={onChanged}
                />
              ))}
            </div>
          </section>
        )}
        {groups.map(
          (group) =>
            group.rows.length > 0 && (
              <section className="card mb-6 overflow-hidden" key={group.title}>
                <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-4 pb-1">
                  <h2 className="flex items-baseline gap-2 text-base">
                    {group.title}
                    <span className="text-sm font-normal text-muted">
                      {group.count}
                    </span>
                  </h2>
                  {group.bulk && (
                    <button
                      className={APPROVE_BUTTON_CLASS}
                      disabled={bulk.busy}
                      onClick={approveConfident}
                    >
                      <Check size={15} />
                      {bulk.busy
                        ? "Zatwierdzam…"
                        : `Zatwierdź pewne (${confident.length})`}
                    </button>
                  )}
                </div>
                <div
                  className={`${ITEM_COLUMNS} hidden pt-2 pb-1 text-xs text-muted lg:grid`}
                >
                  <span>Sprzedawca</span>
                  <span className="text-right">Kwota</span>
                  <span>Kategoria</span>
                  <span />
                </div>
                <div className="divide-y divide-line/40">
                  {group.rows.map((row) => (
                    <ClassificationItem
                      key={row.key}
                      row={row}
                      categories={categories}
                      onChanged={onChanged}
                    />
                  ))}
                </div>
              </section>
            ),
        )}
        {!rows.length && !data?.relations.length && !error && (
          <div className="flex min-h-48 flex-col items-center justify-center gap-4 py-8 text-center text-sm text-muted">
            {loading ? (
              <LoaderCircle
                size={28}
                className="animate-spin motion-reduce:animate-none"
              />
            ) : (
              <Check size={28} />
            )}
            <h3>
              {loading
                ? "Wczytuję…"
                : query
                  ? "Brak wyników."
                  : "Wszystko przypisane."}
            </h3>
            {!query && !loading && (
              <p>Nowe transakcje pojawią się tutaj po imporcie.</p>
            )}
          </div>
        )}
        {remainingRowsCount > 0 && (
          <div className="flex justify-center" ref={sentinelRef}>
            <button
              className="btn"
              disabled={isLoadingMore}
              aria-busy={isLoadingMore}
              onClick={loadMore}
            >
              {isLoadingMore ? (
                <>
                  <LoaderCircle
                    size={16}
                    className="animate-spin motion-reduce:animate-none"
                  />
                  Wczytuję…
                </>
              ) : (
                <>
                  Pokaż kolejne{" "}
                  {Math.min(CLASSIFICATION_PAGE_SIZE, remainingRowsCount)}
                  <span className="text-muted">
                    · zostało {remainingRowsCount}
                  </span>
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </>
  );
}
