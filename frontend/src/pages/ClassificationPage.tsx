import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import * as Popover from "@radix-ui/react-popover";
import { Sparkles, Check, ChevronDown, Link2, LoaderCircle, Search, X } from "lucide-react";
import type { Category, ClassificationRow, Relation } from "../domain";
import { request, useResource, useAction, useLoadMoreSentinel, type Action } from "../hooks";
import { dayLabel, money } from "../api";
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

// The page asks about what the user sees first; the backend caps the merchants per request.
const AI_BATCH = 20;

const ITEM_COLUMNS =
  "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 px-5 lg:grid-cols-[minmax(0,2fr)_8rem_minmax(14rem,1.4fr)_auto] lg:gap-x-6";
const APPROVE_BUTTON_CLASS =
  "inline-flex items-center justify-center gap-1.5 rounded-lg bg-accent-soft px-3 py-1.5 text-sm font-medium text-accent transition hover:bg-accent hover:text-white disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-accent-soft disabled:hover:text-accent";
const REJECT_BUTTON_CLASS =
  "inline-grid size-8 place-items-center rounded-lg text-muted transition hover:bg-danger/10 hover:text-danger disabled:cursor-not-allowed disabled:opacity-50";

type Assigned = { transactionId: number; categoryKey: string; description: string };
type Choice = { category: string; remember: boolean };

function defaultChoice(row: ClassificationRow): Choice {
  return { category: row.category_key ?? "", remember: row.remember };
}

function AiProposal({
  row,
  categories,
  changed,
}: {
  row: ClassificationRow;
  categories: Category[];
  changed: boolean;
}) {
  const confidence = row.confidence !== null ? `${Math.round(row.confidence * 100)}%` : null;
  const proposed = categories.find((item) => item.key === row.category_key)?.label;
  const summary = changed && proposed
    ? `AI: ${proposed}${confidence ? ` · ${confidence}` : ""}`
    : proposed
      ? `Propozycja AI${confidence ? ` · ${confidence}` : ""}`
      : "AI nie wie, wybierz kategorię";
  return (
    <Popover.Root>
      <Popover.Trigger
        className="inline-flex max-w-full items-center gap-1 rounded px-3 text-xs text-muted hover:text-accent disabled:hover:text-muted"
        aria-label={`${summary}. Dlaczego?`}
        disabled={!row.rationale}
      >
        <Sparkles size={13} className="shrink-0 text-accent" />
        <span className="truncate">{summary}</span>
        {row.rationale && <ChevronDown size={13} className="shrink-0" />}
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
  );
}

function ClassificationItem({
  row,
  categories,
  action,
  choice,
  onChoice,
  onAssigned,
  onDecided,
}: {
  row: ClassificationRow;
  categories: Category[];
  action: Action;
  choice: Choice;
  onChoice: (choice: Choice) => void;
  onAssigned: (assigned: Assigned | null) => void;
  onDecided: () => void;
}) {
  const suggestionId = row.suggestion_id;
  const { category, remember } = choice;
  const label = (key: string) => categories.find((item) => item.key === key)?.label ?? key;
  // Without a proposal, picking the category is the decision itself, so it is saved at once.
  async function assign(categoryKey: string) {
    if (!categoryKey) return;
    onChoice({ ...choice, category: categoryKey });
    onAssigned(null);
    const saved = await action.run(
      () => request(`/transactions/${row.transaction_id}/category`, "PUT", { category_key: categoryKey, remember: false }),
      `${row.description}: ${label(categoryKey)}.`,
    );
    if (!saved) onChoice(choice);
    else if (row.transaction_id !== null)
      onAssigned({ transactionId: row.transaction_id, categoryKey, description: row.description });
  }
  async function approve() {
    onAssigned(null);
    const saved = await action.run(
      () => request(`/suggestions/${suggestionId}/approve`, "POST", { category_key: category, remember }),
      `${row.description}: ${label(category)}${remember ? " · zapamiętano dla sprzedawcy" : ""}.`,
    );
    if (saved) onDecided();
  }
  async function reject() {
    onAssigned(null);
    const saved = await action.run(
      () => request(`/suggestions/${suggestionId}/reject`, "POST"),
      "Sugestia odrzucona.",
    );
    if (saved) onDecided();
  }
  const income = transactionDirection(row.totals) === "income";
  const amount = Object.entries(row.totals)
    .map(([currency, total]) => formatSignedAmount(Number(total), currency))
    .join(" / ");
  return (
    <article className={`${ITEM_COLUMNS} py-3`}>
      <div className="min-w-0">
        <strong className="text-sm font-medium leading-relaxed wrap-anywhere">
          {row.description}
        </strong>
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
          {row.ai_rejected && " · AI: propozycja odrzucona"}
        </div>
      </div>
      <div className="text-right">
        <strong
          className={`text-sm font-semibold tabular-nums wrap-anywhere ${income ? "text-success" : ""}`}
          aria-label={`Kwota transakcji: ${amount}`}
        >
          {amount}
        </strong>
      </div>
      <div className="col-span-2 flex min-w-0 flex-col items-start gap-0.5 max-lg:-ml-3 sm:col-span-1 [&>span]:w-full">
        <CategorySelect
          inline
          categories={categories}
          value={category}
          onChange={(key) => (suggestionId ? onChoice({ ...choice, category: key }) : assign(key))}
          label={`Kategoria ${row.description}`}
        />
        {suggestionId && (
          <AiProposal row={row} categories={categories} changed={category !== (row.category_key ?? "")} />
        )}
      </div>
      {suggestionId ? (
        <div className="col-span-2 flex flex-wrap items-center gap-2 sm:col-span-1 sm:justify-end">
          <label
            className="mr-auto flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-muted transition hover:bg-accent-soft hover:text-ink max-sm:-ml-2 sm:mr-0"
            title="Kolejne płatności u tego sprzedawcy dostaną tę kategorię same."
          >
            <input
              type="checkbox"
              className="size-4"
              checked={remember}
              onChange={(event) => onChoice({ ...choice, remember: event.target.checked })}
              aria-label={`Zapamiętaj dla sprzedawcy ${row.description}`}
            />
            Zapamiętaj
          </label>
          <button
            className={APPROVE_BUTTON_CLASS}
            data-approve
            disabled={!category || action.busy}
            aria-label={`Zatwierdź kategorię dla ${row.description}`}
            onClick={() => void approve()}
          >
            <Check size={15} />
            Zatwierdź
          </button>
          <button
            className={REJECT_BUTTON_CLASS}
            disabled={action.busy}
            aria-label={`Odrzuć sugestię dla ${row.description}`}
            title="Odrzuć"
            onClick={() => void reject()}
          >
            <X size={16} />
          </button>
        </div>
      ) : (
        <div className="hidden sm:block" />
      )}
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
  const extension = relation.kind === "group_extension";
  return (
    <article className="flex flex-col justify-between gap-3 px-5 py-4 sm:flex-row sm:items-start">
      <div className="min-w-0">
        <strong className="text-sm font-medium">
          {extension ? `Dopisać do „${relation.payload.title}”?` : relation.payload.title}
        </strong>
        <ul className="mt-2 space-y-1 text-sm">
          {relation.members.map((member) => (
            <li
              key={member.id}
              className="grid grid-cols-[5.5rem_minmax(0,16rem)_7rem] justify-start gap-x-4"
            >
              <span className="text-muted tabular-nums">
                {dayLabel(member.date)}
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
          {extension
            ? relation.cost_after == null
              ? "Część transakcji nie ma kursu, więc koszt grupy trzeba podać ręcznie."
              : relation.cost_before == null
                ? `Koszt grupy po dopisaniu: ${money(relation.cost_after, relation.cost_currency!)}.`
                : `Koszt grupy: ${money(relation.cost_before, relation.cost_currency!)} → ${money(relation.cost_after, relation.cost_currency!)}.`
            : relation.payload.kind === "own_transfer"
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
              extension ? "Dopisano do grupy." : "Grupa utworzona.",
            )
          }
        >
          <Link2 size={15} />
          {extension ? "Dopisz" : "Połącz"}
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
    setActiveKind(kind);
    await action.run(async () => {
      const result = await request<{
        saved: number;
        groups_processed?: number;
        groups_remaining?: number;
        web_searches?: number;
        transactions?: number;
      }>(
        `/ai/${kind}`,
        "POST",
        kind === "merchants" ? { transaction_ids: analyzable.slice(0, AI_BATCH).map((row) => row.transaction_id) } : undefined,
      );
      if (kind === "merchants") {
        const remaining = result.groups_remaining ?? 0;
        setNotice(
          `AI sprawdziło sprzedawców: ${result.groups_processed ?? 0} (transakcji: ${result.transactions ?? 0}). ` +
            `Nowe propozycje: ${result.saved}. Wyszukiwania w internecie: ${result.web_searches ?? 0}.` +
            (remaining ? ` Do sprawdzenia zostało sprzedawców: ${remaining}.` : ""),
        );
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
  const analyzable = rows.filter((row) => row.transaction_id !== null && !row.ai_rejected);
  const [choices, setChoices] = useState<Record<string, Choice>>({});
  const choiceFor = (row: ClassificationRow) => choices[row.key] ?? defaultChoice(row);
  const confident = suggestions.filter(
    (row) => (row.confidence ?? 0) >= 0.9 && choiceFor(row).category,
  );
  const bulk = useAction(onChanged);
  const [assigned, setAssigned] = useState<Assigned | null>(null);
  const list = useRef<HTMLDivElement>(null);
  const [decided, setDecided] = useState<{ slot: number; before: typeof data } | null>(null);
  // Once a decided suggestion leaves the refreshed list, the next one takes its place and gets the
  // focus, so a long review can go on from the keyboard without hunting for the next row.
  useEffect(() => {
    if (!decided || decided.before === data) return;
    const buttons = list.current?.querySelectorAll<HTMLButtonElement>("[data-approve]") ?? [];
    buttons[Math.min(decided.slot, buttons.length - 1)]?.focus();
    setDecided(null);
  }, [data, decided]);
  function rememberAssigned() {
    if (!assigned) return;
    setAssigned(null);
    bulk.run(
      () =>
        request(`/transactions/${assigned.transactionId}/category`, "PUT", {
          category_key: assigned.categoryKey,
          remember: true,
        }),
      `${assigned.description}: zapamiętano dla sprzedawcy.`,
    );
  }
  function approveConfident() {
    setAssigned(null);
    bulk.run(
      () =>
        request("/suggestions/approve-all", "POST", {
          items: confident.map((row) => ({
            id: row.suggestion_id,
            category_key: choiceFor(row).category,
            remember: choiceFor(row).remember,
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
      suggestions: true,
      rows: visibleRows.filter((row) => row.suggestion_id),
    },
    {
      title: "Bez kategorii",
      count: unclassified.length,
      bulk: false,
      suggestions: false,
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
              !analyzable.length
            }
            onClick={() => analyze("merchants")}
          >
            {action.busy && activeKind === "merchants" ? (
              <LoaderCircle size={15} className="animate-spin motion-reduce:animate-none" />
            ) : (
              <Sparkles size={15} />
            )}
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
        undoLabel={bulk.undoLabel}
        onUndo={() => {
          setAssigned(null);
          void bulk.undo();
        }}
        onDismiss={() => {
          setAssigned(null);
          bulk.dismiss();
        }}
        extra={assigned ? { label: "Zapamiętaj dla sprzedawcy", onClick: rememberAssigned } : undefined}
      />
      {activeKind && <Notice error={action.error} notice={notice} />}
      {action.busy && activeKind && (
        <p className="mb-5 flex items-center gap-2 text-sm text-muted" role="status">
          <LoaderCircle size={15} className="animate-spin text-accent motion-reduce:animate-none" />
          {activeKind === "merchants"
            ? `AI analizuje transakcje (${Math.min(analyzable.length, AI_BATCH)}). To może potrwać do minuty.`
            : "AI szuka powiązań między transakcjami. To może potrwać do minuty."}
        </p>
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
                  <span className="px-3">Kategoria</span>
                  <span />
                </div>
                <div className="divide-y divide-line/40" ref={group.suggestions ? list : undefined}>
                  {group.rows.map((row, index) => (
                    <ClassificationItem
                      key={row.key}
                      row={row}
                      categories={categories}
                      action={bulk}
                      choice={choiceFor(row)}
                      onChoice={(choice) => setChoices((current) => ({ ...current, [row.key]: choice }))}
                      onAssigned={setAssigned}
                      onDecided={() => setDecided({ slot: index, before: data })}
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
