import { useEffect, useState, type FormEvent } from "react";
import { ArrowLeftRight, Banknote, HandCoins, Plus } from "lucide-react";
import type { CashCount, CashData, CashExchange, CashFlow, CashPot, Category } from "../domain";
import { request, useAction, useResource, type Action } from "../hooks";
import { money } from "../api";
import { CategorySelect, CurrencyInput, Modal, Notice } from "../components/Forms";
import HelpPopover from "../components/HelpPopover";
import { WALLET_GRID_CLASS, rateLabel } from "../components/WalletParts";
import { ForeignWithdrawalForm, type Withdrawal } from "../components/CashForms";

const CASH_ACCOUNT = "Gotówka";
const HOME = "PLN";
const FORM_CLASS =
  "flex flex-col gap-5 p-5 sm:p-6 [&>p]:text-sm [&>p]:leading-relaxed [&_label]:flex [&_label]:flex-col [&_label]:gap-2 [&_label]:text-sm";
const today = () => new Date().toLocaleDateString("en-CA");

function dayLabel(value: string) {
  return value.split("-").reverse().join(".");
}

function FormFooter({ busy, onClose, disabled, onDelete, deleteNote }: {
  busy: boolean;
  onClose: () => void;
  disabled?: boolean;
  onDelete?: () => void;
  deleteNote?: string;
}) {
  const [confirming, setConfirming] = useState(false);
  if (confirming) {
    return (
      <footer className="flex flex-wrap items-center gap-2 border-t border-line pt-5">
        <span className="mr-auto text-sm">{deleteNote ?? "Usunąć ten wpis?"}</span>
        <button type="button" className="btn" onClick={() => setConfirming(false)} disabled={busy}>
          Nie
        </button>
        <button type="button" className="btn-danger" onClick={onDelete} disabled={busy}>
          Usuń
        </button>
      </footer>
    );
  }
  return (
    <footer className="flex flex-wrap items-center gap-2 border-t border-line pt-5">
      {onDelete && (
        <button type="button" className="btn-danger mr-auto" disabled={busy} onClick={() => setConfirming(true)}>
          Usuń
        </button>
      )}
      <button type="button" className="btn ml-auto" onClick={onClose} disabled={busy}>
        Anuluj
      </button>
      <button className="btn-primary" disabled={busy || disabled}>
        {busy ? "Zapisuję…" : "Zapisz"}
      </button>
    </footer>
  );
}

type Split = { amount: string; category: string; description?: string | null };
type Preview = { first: boolean; spent: string; correction: string };

function CountForm({
  currency: initialCurrency,
  existing,
  categories,
  onClose,
  action,
}: {
  currency: string;
  existing?: CashCount;
  categories: Category[];
  onClose: () => void;
  action: Action;
}) {
  const [currency, setCurrency] = useState(existing?.currency ?? initialCurrency);
  const [amount, setAmount] = useState(existing?.amount ?? "");
  const [startCost, setStartCost] = useState(existing?.start_cost ?? "");
  const [day, setDay] = useState(existing?.counted_on ?? today());
  const [splits, setSplits] = useState<Split[]>(
    existing?.lines.length
      ? existing.lines.map((line) => ({
          amount: line.amount, category: line.category_key ?? "", description: line.description,
        }))
      : [{ amount: "", category: "" }],
  );
  const [preview, setPreview] = useState<Preview | null>(null);

  useEffect(() => {
    if (amount === "" || Number(amount) < 0 || !day || currency.length !== 3) {
      setPreview(null);
      return;
    }
    const params = new URLSearchParams({ counted_on: day, currency, amount: Number(amount).toFixed(2) });
    if (existing) params.set("replacing", String(existing.id));
    let current = true;
    request<Preview>(`/cash/count-preview?${params}`)
      .then((value) => current && setPreview(value))
      .catch(() => current && setPreview(null));
    return () => {
      current = false;
    };
  }, [amount, day, currency, existing]);

  const spent = Number(preview?.spent ?? 0);
  const correction = Number(preview?.correction ?? 0);
  const asksCost = Boolean(preview?.first) && correction > 0 && currency !== HOME;
  const filled = splits.filter((split) => Number(split.amount) > 0);
  const unassigned = spent - filled.reduce((sum, split) => sum + Number(split.amount), 0);
  const update = (index: number, change: Partial<Split>) =>
    setSplits(splits.map((split, at) => (at === index ? { ...split, ...change } : split)));

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const ok = await action.run(() =>
      request(existing ? `/cash/counts/${existing.id}` : "/cash/counts", existing ? "PUT" : "POST", {
        currency,
        counted_on: day,
        amount,
        start_cost: asksCost && startCost !== "" ? startCost : null,
        lines: spent > 0
          ? filled.map((split) => ({
              amount: split.amount, category_key: split.category, description: split.description ?? null,
            }))
          : [],
      }),
    );
    if (ok) onClose();
  }

  return (
    <Modal title={existing ? "Liczenie gotówki" : "Policz gotówkę"} onClose={onClose} busy={action.busy}>
      <form onSubmit={submit} className={FORM_CLASS}>
        <Notice error={action.error} />
        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_6rem_minmax(0,1fr)]">
          <label>
            Ile masz
            <input
              type="number"
              min="0"
              step="0.01"
              required
              autoFocus
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
            />
          </label>
          <label>
            Waluta
            <CurrencyInput ariaLabel="Waluta" value={currency} onChange={setCurrency} />
          </label>
          <label>
            Dzień
            <input type="date" required value={day} onChange={(event) => setDay(event.target.value)} />
          </label>
        </div>
        {preview?.first && correction > 0 && <p className="text-muted">To będzie stan na start.</p>}
        {asksCost && (
          <label>
            Ile to kosztowało w złotówkach
            <input
              type="number"
              min="0"
              step="0.01"
              value={startCost}
              onChange={(event) => setStartCost(event.target.value)}
            />
          </label>
        )}
        {preview && !preview.first && correction > 0 && (
          <p className="text-muted">
            Masz o {money(correction, currency)} więcej, niż wynika z zapisów. Zapiszę to jako
            korektę stanu.
          </p>
        )}
        {preview && spent === 0 && correction === 0 && <p className="text-muted">Zgadza się z zapisami.</p>}
        {spent > 0 && (
          <>
            <p>
              Wydane: <strong>{money(spent, currency)}</strong>. Rozdziel z grubsza albo zostaw bez
              kategorii.
            </p>
            {splits.map((split, index) => (
              <div key={index} className="grid gap-4 sm:grid-cols-[8rem_minmax(0,1fr)]">
                <label>
                  Kwota
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={split.amount}
                    onChange={(event) => update(index, { amount: event.target.value })}
                  />
                </label>
                <CategorySelect
                  categories={categories}
                  label="Na co"
                  value={split.category}
                  onChange={(value) => update(index, { category: value })}
                />
              </div>
            ))}
            <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
              <button
                type="button"
                className="btn"
                onClick={() => setSplits([...splits, { amount: "", category: "" }])}
              >
                <Plus size={16} />
                Kolejna kategoria
              </button>
              <span className={unassigned < 0 ? "text-danger" : "text-muted"}>
                {unassigned < 0
                  ? `Przypisane o ${money(-unassigned, currency)} za dużo`
                  : `Bez kategorii: ${money(unassigned, currency)}`}
              </span>
            </div>
          </>
        )}
        <FormFooter
          busy={action.busy}
          onClose={onClose}
          disabled={!preview || unassigned < -0.004 || filled.some((split) => !split.category)}
          onDelete={existing ? async () => {
            if (await action.run(() => request(`/cash/counts/${existing.id}`, "DELETE"))) onClose();
          } : undefined}
          deleteNote={existing?.lines.length
            ? `Usunąć liczenie? Usunie też podział ${money(
                existing.lines.reduce((sum, line) => sum + Number(line.amount), 0), existing.currency,
              )}.`
            : "Usunąć liczenie?"}
        />
      </form>
    </Modal>
  );
}

function ReceivedForm({
  existing,
  categories,
  onClose,
  action,
}: {
  existing?: CashFlow;
  categories: Category[];
  onClose: () => void;
  action: Action;
}) {
  const [category, setCategory] = useState(existing?.category_key ?? "income_other");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    const ok = await action.run(() =>
      request(existing ? `/transactions/${existing.transaction_id}` : "/transactions", existing ? "PUT" : "POST", {
        account: CASH_ACCOUNT,
        booking_date: fields.get("date"),
        amount: fields.get("amount"),
        currency: HOME,
        description: fields.get("description"),
        category_key: category,
      }),
    );
    if (ok) onClose();
  }

  return (
    <Modal title="Otrzymana gotówka" onClose={onClose} busy={action.busy}>
      <form onSubmit={submit} className={FORM_CLASS}>
        <Notice error={action.error} />
        <div className="grid gap-4 sm:grid-cols-2">
          <label>
            Kwota (zł)
            <input
              name="amount"
              type="number"
              min="0.01"
              step="0.01"
              required
              autoFocus
              defaultValue={existing?.amount}
            />
          </label>
          <label>
            Dzień
            <input name="date" type="date" required defaultValue={existing?.date ?? today()} />
          </label>
          <label>
            Od kogo albo za co
            <input
              name="description"
              required
              maxLength={500}
              placeholder="Na przykład: od babci"
              defaultValue={existing?.description}
            />
          </label>
          <CategorySelect
            categories={categories.filter((item) => item.kind === "income")}
            value={category}
            onChange={setCategory}
          />
        </div>
        <p className="text-muted">Wypłat z bankomatu tu nie wpisuj — dodają się same z wyciągu.</p>
        <FormFooter
          busy={action.busy}
          onClose={onClose}
          disabled={!category}
          onDelete={existing ? async () => {
            if (await action.run(() => request(`/transactions/${existing.transaction_id}`, "DELETE"))) onClose();
          } : undefined}
        />
      </form>
    </Modal>
  );
}

function ExchangeForm({ existing, onClose, action }: {
  existing?: CashExchange;
  onClose: () => void;
  action: Action;
}) {
  const [givenCurrency, setGivenCurrency] = useState(existing?.given_currency ?? HOME);
  const [receivedCurrency, setReceivedCurrency] = useState(existing?.received_currency ?? "");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    const ok = await action.run(() =>
      request(existing ? `/cash/exchanges/${existing.id}` : "/cash/exchanges", existing ? "PUT" : "POST", {
        exchanged_on: fields.get("date"),
        given_currency: givenCurrency,
        given_amount: fields.get("given"),
        received_currency: receivedCurrency,
        received_amount: fields.get("received"),
      }),
    );
    if (ok) onClose();
  }

  return (
    <Modal title="Wymiana w kantorze" onClose={onClose} busy={action.busy}>
      <form onSubmit={submit} className={FORM_CLASS}>
        <Notice error={action.error} />
        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_6rem]">
          <label>
            Oddane
            <input
              name="given"
              type="number"
              min="0.01"
              step="0.01"
              required
              autoFocus
              defaultValue={existing?.given_amount}
            />
          </label>
          <label>
            Waluta
            <CurrencyInput ariaLabel="Waluta oddana" value={givenCurrency} onChange={setGivenCurrency} />
          </label>
          <label>
            Otrzymane
            <input
              name="received"
              type="number"
              min="0.01"
              step="0.01"
              required
              defaultValue={existing?.received_amount}
            />
          </label>
          <label>
            Waluta
            <CurrencyInput ariaLabel="Waluta otrzymana" value={receivedCurrency} onChange={setReceivedCurrency} />
          </label>
          <label>
            Dzień
            <input name="date" type="date" required defaultValue={existing?.date ?? today()} />
          </label>
        </div>
        <FormFooter
          busy={action.busy}
          onClose={onClose}
          onDelete={existing ? async () => {
            if (await action.run(() => request(`/cash/exchanges/${existing.id}`, "DELETE"))) onClose();
          } : undefined}
        />
      </form>
    </Modal>
  );
}

function withdrawalOf(flow: CashFlow): Withdrawal {
  const mapped = flow.bank_currency !== flow.currency;
  return {
    transactionId: flow.transaction_id,
    date: flow.date,
    account: flow.account,
    bankAmount: flow.bank_amount!,
    bankCurrency: flow.bank_currency!,
    cashAmount: mapped ? flow.amount : null,
    cashCurrency: mapped ? flow.currency : null,
  };
}

function countDetails(count: CashCount) {
  const parts: string[] = [];
  if (Number(count.spent) > 0) {
    parts.push(`wydane ${money(count.spent, count.currency)}`);
    for (const line of count.lines) parts.push(`${line.label} ${money(line.amount, count.currency)}`);
    const unassigned = Number(count.unassigned);
    if (unassigned > 0 && count.lines.length) parts.push(`bez kategorii ${money(unassigned, count.currency)}`);
    if (unassigned < 0) parts.push(`przypisane o ${money(-unassigned, count.currency)} za dużo`);
  }
  if (Number(count.correction) > 0) {
    parts.push(count.first ? "stan na start" : `korekta stanu +${money(count.correction, count.currency)}`);
  }
  return parts.length ? parts.join(" · ") : "zgadza się";
}

type HistoryRow = {
  key: string;
  date: string;
  order: number;
  description: string;
  details?: string;
  amount: number | null;
  target?: EditTarget;
  hint?: string;
};

type EditTarget =
  | { type: "count"; count: CashCount }
  | { type: "exchange"; exchange: CashExchange }
  | { type: "received"; flow: CashFlow }
  | { type: "withdrawal"; flow: CashFlow };

function historyRows(data: CashData, currency: string): HistoryRow[] {
  const rows: HistoryRow[] = [
    ...data.flows
      .filter((flow) => flow.currency === currency)
      .map((flow) => ({
        key: `t${flow.transaction_id}`,
        date: flow.date,
        order: 0,
        description: flow.description,
        details: flow.kind === "entry"
          ? undefined
          : flow.bank_currency !== flow.currency
            ? `${flow.account} · ${money(flow.bank_amount!, flow.bank_currency!)} z konta`
            : flow.account,
        amount: Number(flow.amount),
        target: flow.kind === "withdrawal"
          ? { type: "withdrawal" as const, flow }
          : flow.kind === "entry" && Number(flow.amount) > 0 && flow.account === CASH_ACCOUNT
            ? { type: "received" as const, flow }
            : undefined,
      })),
    ...data.exchanges
      .filter((exchange) => [exchange.given_currency, exchange.received_currency].includes(currency))
      .map((exchange) => ({
        key: `e${exchange.id}`,
        date: exchange.date,
        order: 0,
        description: "Wymiana w kantorze",
        details: [
          `${money(exchange.given_amount, exchange.given_currency)} → ${money(exchange.received_amount, exchange.received_currency)}`,
          exchange.fx_result && Number(exchange.fx_result) !== 0
            ? `różnica kursowa ${Number(exchange.fx_result) > 0 ? "+" : ""}${money(exchange.fx_result, HOME)}`
            : "",
        ].filter(Boolean).join(" · "),
        amount: exchange.given_currency === currency
          ? -Number(exchange.given_amount)
          : Number(exchange.received_amount),
        target: { type: "exchange" as const, exchange },
      })),
    ...data.counts
      .filter((count) => count.currency === currency)
      .map((count) => ({
        key: `c${count.id}`,
        date: count.counted_on,
        order: 1,
        description: `Policzone: ${money(count.amount, count.currency)}`,
        details: countDetails(count),
        amount: Number(count.correction) - Number(count.spent) || null,
        target: { type: "count" as const, count },
        hint: Number(count.unassigned) < 0 ? "popraw" : Number(count.unassigned) > 0 ? "rozdziel" : undefined,
      })),
  ];
  // A count closes its day, so it sits above that day's movements in a newest-first list.
  return rows.sort((a, b) => b.date.localeCompare(a.date) || b.order - a.order);
}

function PotTile({ pot, selected, onSelect }: { pot: CashPot; selected: boolean; onSelect: () => void }) {
  return (
    <button
      className={`card flex flex-col gap-5 p-5 text-left transition hover:ring-accent/50 ${selected ? "ring-2! ring-accent!" : ""}`}
      aria-pressed={selected}
      onClick={onSelect}
    >
      <span className="flex w-full items-center gap-3">
        <span className="grid h-8 shrink-0 place-items-center rounded-lg bg-accent-soft px-2 text-xs font-semibold tracking-wide text-accent ring-1 ring-accent/30">
          {pot.currency}
        </span>
        <span className="min-w-0 flex-1 truncate text-sm text-muted">{CASH_ACCOUNT}</span>
        <Banknote size={18} className="shrink-0 text-muted" aria-hidden />
      </span>
      <span>
        <strong className="block text-2xl font-semibold tracking-tight tabular-nums">
          {money(pot.balance, pot.currency)}
        </strong>
        {pot.currency !== HOME && (
          <span className="block text-sm text-muted tabular-nums">
            {pot.pln_value === null ? "Brak kursu" : `≈ ${money(pot.pln_value, HOME)}`}
          </span>
        )}
        {pot.currency !== HOME && pot.average_cost !== null && (
          <span className="block text-xs text-muted tabular-nums">{rateLabel(pot.average_cost, pot.currency)}</span>
        )}
        <span className="block text-xs text-muted">
          {pot.counted_on ? `policzone ${dayLabel(pot.counted_on)}` : "jeszcze nie policzone"}
        </span>
      </span>
    </button>
  );
}

export default function CashPage({
  categories,
  revision,
  onChanged,
}: {
  categories: Category[];
  revision: number;
  onChanged: () => void;
}) {
  const { data, error, loading } = useResource<CashData>("/cash", revision);
  const action = useAction(onChanged);
  const [selected, setSelected] = useState(HOME);
  const [modal, setModal] = useState<"count" | "received" | "exchange" | null>(null);
  const [editing, setEditing] = useState<EditTarget | null>(null);
  const closeEditing = () => setEditing(null);
  const pots = data?.pots ?? [];
  const currency = pots.some((pot) => pot.currency === selected) ? selected : HOME;
  const rows = data ? historyRows(data, currency) : [];
  const hasAnything = Boolean(data && (data.flows.length || data.counts.length || data.exchanges.length));
  const countButton = (
    <button className="btn" onClick={() => setModal("count")}>
      <HandCoins size={17} />
      Policz gotówkę
    </button>
  );
  return (
    <>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <h1>Gotówka</h1>
          <HelpPopover label="Jak działa gotówka">
            <p>
              Wypłaty z bankomatu trafiają tu same z wyciągów. Co jakiś czas policz, ile masz —
              różnica to Twoje wydatki.
            </p>
          </HelpPopover>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn" onClick={() => setModal("received")}>
            <Plus size={17} />
            Otrzymana gotówka
          </button>
          <button className="btn" onClick={() => setModal("exchange")}>
            <ArrowLeftRight size={17} />
            Wymiana w kantorze
          </button>
          {countButton}
        </div>
      </div>
      <Notice
        error={error || (modal || editing ? "" : action.error)}
        notice={action.notice} undoLabel={action.undoLabel} onUndo={action.undo} />
      {data && !hasAnything && (
        <div className="card flex min-h-48 flex-col items-center justify-center gap-4 px-6 py-10 text-center text-sm text-muted">
          <p className="max-w-md leading-relaxed">
            Wypłaty z bankomatu pojawią się tu same po imporcie wyciągu. Masz już gotówkę? Policz
            ją.
          </p>
          {countButton}
        </div>
      )}
      {!data && loading && <p className="text-sm text-muted">Wczytuję…</p>}
      {hasAnything && (
        <>
          <div className={WALLET_GRID_CLASS}>
            {pots.map((pot) => (
              <PotTile
                key={pot.currency}
                pot={pot}
                selected={pot.currency === currency}
                onSelect={() => setSelected(pot.currency)}
              />
            ))}
          </div>
          <section className="card overflow-x-auto p-6">
            {!rows.length && <p className="text-sm text-muted">Pusto.</p>}
            {rows.length > 0 && (
              <table className="w-full text-sm [&_td]:border-t [&_td]:border-line/40 [&_td]:py-2.5 [&_td]:pr-4 [&_td]:align-top [&_th]:pr-4 [&_th]:pb-2 [&_th]:text-left [&_th]:text-xs [&_th]:font-normal [&_th]:text-muted">
                <thead>
                  <tr>
                    <th>Data</th>
                    <th>Opis</th>
                    <th className="text-right!">Kwota</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.key}>
                      <td className="whitespace-nowrap text-muted tabular-nums">{dayLabel(row.date)}</td>
                      <td className="w-full">
                        {row.target ? (
                          <button
                            className="text-left hover:text-accent hover:underline"
                            onClick={() => setEditing(row.target!)}
                          >
                            {row.description}
                          </button>
                        ) : (
                          row.description
                        )}
                        {row.details && (
                          <span className="block text-xs text-muted">
                            {row.details}
                            {row.hint && (
                              <button
                                className="underline-offset-2 hover:text-accent hover:underline"
                                onClick={() => setEditing(row.target!)}
                              >
                                {" · "}{row.hint}
                              </button>
                            )}
                          </span>
                        )}
                      </td>
                      <td className="whitespace-nowrap text-right tabular-nums">
                        {row.amount === null ? "" : money(row.amount, currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </>
      )}
      {modal === "count" && (
        <CountForm currency={currency} categories={categories} onClose={() => setModal(null)} action={action} />
      )}
      {modal === "received" && (
        <ReceivedForm categories={categories} onClose={() => setModal(null)} action={action} />
      )}
      {modal === "exchange" && <ExchangeForm onClose={() => setModal(null)} action={action} />}
      {editing?.type === "count" && (
        <CountForm
          currency={editing.count.currency}
          existing={editing.count}
          categories={categories}
          onClose={closeEditing}
          action={action}
        />
      )}
      {editing?.type === "received" && (
        <ReceivedForm existing={editing.flow} categories={categories} onClose={closeEditing} action={action} />
      )}
      {editing?.type === "withdrawal" && (
        <ForeignWithdrawalForm withdrawal={withdrawalOf(editing.flow)} onClose={closeEditing} action={action} />
      )}
      {editing?.type === "exchange" && (
        <ExchangeForm existing={editing.exchange} onClose={closeEditing} action={action} />
      )}
    </>
  );
}
