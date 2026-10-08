import { useEffect, useState, type FormEvent } from "react";
import { Banknote, HandCoins, Plus } from "lucide-react";
import type { CashCount, CashData, CashFlow, Category } from "../domain";
import { request, useAction, useResource } from "../hooks";
import { money } from "../api";
import { CategorySelect, Modal, Notice } from "../components/Forms";
import HelpPopover from "../components/HelpPopover";
import { WALLET_GRID_CLASS } from "../components/WalletParts";

function dayLabel(value: string) {
  return value.split("-").reverse().join(".");
}

const FLOW_LABELS: Record<CashFlow["kind"], string> = {
  withdrawal: "Wypłata z bankomatu",
  deposit: "Wpłata do wpłatomatu",
  entry: "",
};

type Split = { amount: string; category: string };

function CountForm({
  categories,
  onClose,
  onSaved,
}: {
  categories: Category[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [amount, setAmount] = useState("");
  const [day, setDay] = useState(new Date().toLocaleDateString("en-CA"));
  const [splits, setSplits] = useState<Split[]>([{ amount: "", category: "" }]);
  const [preview, setPreview] = useState<{ start: boolean; spent: string; correction: string } | null>(null);
  const action = useAction(onSaved);

  useEffect(() => {
    if (amount === "" || Number(amount) < 0 || !day) {
      setPreview(null);
      return;
    }
    const params = new URLSearchParams({ counted_on: day, amount: Number(amount).toFixed(2) });
    let current = true;
    request<{ start: boolean; spent: string; correction: string }>(`/cash/count-preview?${params}`)
      .then((value) => current && setPreview(value))
      .catch(() => current && setPreview(null));
    return () => {
      current = false;
    };
  }, [amount, day]);

  const spent = Number(preview?.spent ?? 0);
  const filled = splits.filter((split) => Number(split.amount) > 0);
  const assigned = filled.reduce((sum, split) => sum + Number(split.amount), 0);
  const unassigned = spent - assigned;
  const update = (index: number, change: Partial<Split>) =>
    setSplits(splits.map((split, at) => (at === index ? { ...split, ...change } : split)));

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const ok = await action.run(() =>
      request("/cash/counts", "POST", {
        counted_on: day,
        amount,
        lines: spent > 0
          ? filled.map((split) => ({ amount: split.amount, category_key: split.category }))
          : [],
      }),
    );
    if (ok) onClose();
  }

  return (
    <Modal title="Policz gotówkę" onClose={onClose} busy={action.busy}>
      <form
        onSubmit={submit}
        className="flex flex-col gap-5 p-5 sm:p-6 [&>p]:text-sm [&>p]:leading-relaxed [&_label]:flex [&_label]:flex-col [&_label]:gap-2 [&_label]:text-sm"
      >
        <Notice error={action.error} />
        <div className="grid gap-4 sm:grid-cols-2">
          <label>
            Ile masz (zł)
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
            Dzień
            <input type="date" required value={day} onChange={(event) => setDay(event.target.value)} />
          </label>
        </div>
        {preview?.start && <p className="text-muted">To będzie stan na start.</p>}
        {preview && Number(preview.correction) > 0 && (
          <p className="text-muted">
            Masz o {money(preview.correction, "PLN")} więcej, niż wynika z zapisów. Zapiszę to
            jako korektę stanu.
          </p>
        )}
        {preview && !preview.start && spent === 0 && Number(preview.correction) === 0 && (
          <p className="text-muted">Zgadza się z zapisami.</p>
        )}
        {spent > 0 && (
          <>
            <p>
              Wydane: <strong>{money(spent, "PLN")}</strong>. Rozdziel z grubsza albo zostaw bez
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
                  ? `Przypisane o ${money(-unassigned, "PLN")} za dużo`
                  : `Bez kategorii: ${money(unassigned, "PLN")}`}
              </span>
            </div>
          </>
        )}
        <footer className="flex flex-wrap justify-end gap-2 border-t border-line pt-5">
          <button type="button" className="btn" onClick={onClose} disabled={action.busy}>
            Anuluj
          </button>
          <button
            className="btn-primary"
            disabled={
              action.busy ||
              !preview ||
              unassigned < -0.004 ||
              filled.some((split) => !split.category)
            }
          >
            {action.busy ? "Zapisuję…" : "Zapisz"}
          </button>
        </footer>
      </form>
    </Modal>
  );
}

function countDetails(count: CashCount) {
  if (count.start) return "stan na start";
  const parts: string[] = [];
  if (Number(count.spent) > 0) {
    parts.push(`wydane ${money(count.spent, "PLN")}`);
    for (const line of count.lines) parts.push(`${line.label} ${money(line.amount, "PLN")}`);
    const unassigned = Number(count.unassigned);
    if (unassigned > 0 && count.lines.length) parts.push(`bez kategorii ${money(unassigned, "PLN")}`);
    if (unassigned < 0) parts.push(`przypisane o ${money(-unassigned, "PLN")} za dużo`);
  }
  if (Number(count.correction) > 0) parts.push(`korekta stanu +${money(count.correction, "PLN")}`);
  return parts.length ? parts.join(" · ") : "zgadza się";
}

type HistoryRow = {
  key: string;
  date: string;
  description: string;
  details?: string;
  amount: number | null;
  order: number;
};

function historyRows(data: CashData): HistoryRow[] {
  const rows: HistoryRow[] = [
    ...data.flows.map((flow) => ({
      key: `t${flow.transaction_id}`,
      date: flow.date,
      description:
        flow.kind === "entry" ? flow.description : `${FLOW_LABELS[flow.kind]} · ${flow.account}`,
      amount: Number(flow.amount),
      order: 0,
    })),
    ...data.counts.map((count) => ({
      key: `c${count.id}`,
      date: count.counted_on,
      description: `Policzone: ${money(count.amount, "PLN")}`,
      details: countDetails(count),
      amount: count.start ? null : Number(count.correction) - Number(count.spent) || null,
      order: 1,
    })),
  ];
  // A count closes its day, so it sits above that day's movements in a newest-first list.
  return rows.sort((a, b) => b.date.localeCompare(a.date) || b.order - a.order);
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
  const [counting, setCounting] = useState(false);
  const rows = data ? historyRows(data) : [];
  const lastCount = data?.counts.at(-1);
  const countButton = (
    <button className="btn" onClick={() => setCounting(true)}>
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
        {countButton}
      </div>
      <Notice error={error} />
      {data && !rows.length && (
        <div className="card flex min-h-48 flex-col items-center justify-center gap-4 px-6 py-10 text-center text-sm text-muted">
          <p className="max-w-md leading-relaxed">
            Wypłaty z bankomatu pojawią się tu same po imporcie wyciągu. Masz już gotówkę? Policz
            ją.
          </p>
          {countButton}
        </div>
      )}
      {!data && loading && <p className="text-sm text-muted">Wczytuję…</p>}
      {data && rows.length > 0 && (
        <>
          <div className={WALLET_GRID_CLASS}>
            <div className="card flex flex-col gap-5 p-5">
              <span className="flex w-full items-center gap-3">
                <span className="grid h-8 shrink-0 place-items-center rounded-lg bg-accent-soft px-2 text-xs font-semibold tracking-wide text-accent ring-1 ring-accent/30">
                  PLN
                </span>
                <span className="min-w-0 flex-1 truncate text-sm text-muted">Gotówka</span>
                <Banknote size={18} className="shrink-0 text-muted" aria-hidden />
              </span>
              <span>
                <strong className="block text-2xl font-semibold tracking-tight tabular-nums">
                  {money(data.balance, "PLN")}
                </strong>
                <span className="block text-sm text-muted">
                  {lastCount ? `policzone ${dayLabel(lastCount.counted_on)}` : "jeszcze nie policzone"}
                </span>
              </span>
            </div>
          </div>
          <section className="card overflow-x-auto p-6">
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
                      {row.description}
                      {row.details && <span className="block text-xs text-muted">{row.details}</span>}
                    </td>
                    <td className="whitespace-nowrap text-right tabular-nums">
                      {row.amount === null ? "" : money(row.amount, "PLN")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </>
      )}
      {counting && (
        <CountForm categories={categories} onClose={() => setCounting(false)} onSaved={onChanged} />
      )}
    </>
  );
}
