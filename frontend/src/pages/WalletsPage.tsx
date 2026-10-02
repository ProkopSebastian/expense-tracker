import { useId, useState, type FormEvent, type ReactNode } from "react";
import {
  ArrowDownToLine,
  ArrowLeftRight,
  Banknote,
  Landmark,
  Plus,
  Scale,
  Trash2,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";
import type { Wallet, WalletEvent } from "../domain";
import { request, useResource, useAction } from "../hooks";
import { money } from "../api";
import type { Category } from "../domain";
import { CategorySelect, CurrencyInput, Modal, Notice } from "../components/Forms";
import AppSelect from "../components/AppSelect";
import HelpPopover from "../components/HelpPopover";

const FORM_CLASS =
  "flex flex-col gap-5 p-5 sm:p-6 [&>p]:text-sm [&>p]:leading-relaxed [&_label]:flex [&_label]:flex-col [&_label]:gap-2 [&_label]:text-sm [&_label_small]:text-xs [&_label_small]:text-muted";

// A rate rounded to grosze is useless: 0,40 and 0,401849 differ by złoty over a few hundred
// dirhams. Money stays at two places; the rate gets four.
const rateFormat = new Intl.NumberFormat("pl-PL", {
  minimumFractionDigits: 4,
  maximumFractionDigits: 4,
});

function rateLabel(value: string, currency: string) {
  return `${rateFormat.format(Number(value))} zł / 1 ${currency}`;
}

const EVENT_LABELS: Record<WalletEvent["kind"], string> = {
  topup: "Zasilenie",
  spend: "Wydatek",
  inflow: "Wpływ",
  conversion_out: "Wymiana na inną walutę",
};

function NewWalletForm({
  accounts,
  onClose,
  onSaved,
}: {
  accounts: string[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const action = useAction(onSaved);
  const accountListId = useId();
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    const ok = await action.run(() =>
      request("/wallets", "POST", {
        account: fields.get("account"),
        currency: fields.get("currency"),
      }),
    );
    if (ok) onClose();
  }
  return (
    <Modal title="Nowy portfel" onClose={onClose} busy={action.busy}>
      <form onSubmit={submit} className={FORM_CLASS}>
        <Notice error={action.error} />
        <p className="text-muted">
          Portfel to pieniądze, o których wyciąg nie mówi wszystkiego: gotówka w
          kieszeni albo waluta obca. Konto bankowe w złotówkach portfela nie
          potrzebuje — tam bank widzi każdą płatność.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <label>
            Gdzie trzymasz
            <input
              name="account"
              list={accountListId}
              required
              maxLength={500}
              defaultValue="Gotówka"
            />
            <datalist id={accountListId}>
              {accounts.map((account) => (
                <option key={account} value={account} />
              ))}
            </datalist>
            <small>Na przykład Gotówka albo revolut.</small>
          </label>
          <label>
            Waluta
            <CurrencyInput name="currency" ariaLabel="Waluta portfela" />
            <small>Trzyliterowy kod. PLN też jest w porządku.</small>
          </label>
        </div>
        <footer className="flex flex-wrap justify-end gap-2 border-t border-line pt-5">
          <button
            type="button"
            className="btn"
            disabled={action.busy}
            onClick={onClose}
          >
            Anuluj
          </button>
          <button className="btn-primary" disabled={action.busy}>
            {action.busy ? "Zapisuję…" : "Utwórz portfel"}
          </button>
        </footer>
      </form>
    </Modal>
  );
}

type Split = { amount: string; category: string; description: string };

function ReconcileForm({
  wallet,
  categories,
  onClose,
  onSaved,
}: {
  wallet: Wallet;
  categories: Category[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [remaining, setRemaining] = useState("0");
  const [day, setDay] = useState(new Date().toLocaleDateString("en-CA"));
  const [splits, setSplits] = useState<Split[]>([
    { amount: "", category: "", description: "" },
  ]);
  const action = useAction(onSaved);

  const balance = Number(wallet.balance);
  const missing = balance - Number(remaining || 0);
  const assigned = splits.reduce((sum, split) => sum + Number(split.amount || 0), 0);
  const left = missing - assigned;
  const surplus = missing < 0;

  function update(index: number, patch: Partial<Split>) {
    setSplits(splits.map((split, at) => (at === index ? { ...split, ...patch } : split)));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const ok = await action.run(() =>
      request(`/wallets/${wallet.id}/reconcile`, "POST", {
        remaining,
        booking_date: day,
        lines: splits
          .filter((split) => Number(split.amount) > 0)
          .map((split) => ({
            amount: split.amount,
            category_key: split.category,
            description: split.description || "Wydatki gotówkowe",
          })),
      }),
    );
    if (ok) onClose();
  }

  return (
    <Modal
      title={`Rozlicz portfel ${wallet.currency}`}
      onClose={onClose}
      busy={action.busy}
    >
      <form onSubmit={submit} className={FORM_CLASS}>
        <Notice error={action.error} />
        <p className="text-muted">
          Nie musisz pamiętać każdego wydatku. Podaj, ile zostało — resztę
          aplikacja wyliczy sama, a Ty rozdzielisz ją na kategorie z grubsza.
          Suma będzie dokładna, podział przybliżony.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <label>
            Ile zostało ({wallet.currency})
            <input
              type="number"
              min="0"
              step="0.01"
              required
              value={remaining}
              onChange={(event) => setRemaining(event.target.value)}
            />
            <small>W portfelu jest {money(wallet.balance, wallet.currency)}.</small>
          </label>
          <label>
            Data wydatków
            <input
              type="date"
              required
              value={day}
              onChange={(event) => setDay(event.target.value)}
            />
            <small>Kiedy te pieniądze zostały wydane, nie dzisiaj.</small>
          </label>
        </div>
        {surplus ? (
          <p className="flex items-center gap-3 rounded-xl px-4 py-3 text-sm leading-relaxed bg-danger/10 text-danger">
            <TriangleAlert size={17} />
            Podajesz więcej, niż portfel kiedykolwiek dostał. Brakuje zapisanego
            zasilenia — dodaj je najpierw.
          </p>
        ) : (
          <>
            <p className="text-muted">
              Do rozdzielenia: {money(missing, wallet.currency)} · zostało{" "}
              {money(left, wallet.currency)}
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
                <label>
                  Na co
                  <CategorySelect
                    categories={categories}
                    value={split.category}
                    onChange={(value) => update(index, { category: value })}
                  />
                </label>
              </div>
            ))}
            <button
              type="button"
              className="btn self-start"
              onClick={() =>
                setSplits([...splits, { amount: "", category: "", description: "" }])
              }
            >
              <Plus size={16} />
              Kolejna kategoria
            </button>
          </>
        )}
        <footer className="flex flex-wrap justify-end gap-2 border-t border-line pt-5">
          <button
            type="button"
            className="btn"
            onClick={onClose}
            disabled={action.busy}
          >
            Anuluj
          </button>
          <button
            className="btn-primary"
            disabled={
              action.busy ||
              surplus ||
              missing <= 0 ||
              Math.abs(left) > 0.004 ||
              splits.some((split) => Number(split.amount) > 0 && !split.category)
            }
          >
            {action.busy ? "Zapisuję…" : "Rozlicz"}
          </button>
        </footer>
      </form>
    </Modal>
  );
}

function ConvertForm({
  wallet,
  wallets,
  onClose,
  onSaved,
}: {
  wallet: Wallet;
  wallets: Wallet[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const targets = wallets.filter((item) => item.id !== wallet.id);
  const [targetId, setTargetId] = useState(targets[0] ? String(targets[0].id) : "");
  const [given, setGiven] = useState("");
  const [received, setReceived] = useState("");
  const [day, setDay] = useState(new Date().toLocaleDateString("en-CA"));
  const action = useAction(onSaved);
  const target = targets.find((item) => String(item.id) === targetId);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const ok = await action.run(() =>
      request(`/wallets/${wallet.id}/convert`, "POST", {
        target_wallet_id: Number(targetId),
        given_amount: given,
        received_amount: received,
        booking_date: day,
      }),
    );
    if (ok) onClose();
  }

  return (
    <Modal
      title={`Wymień ${wallet.currency} na inną walutę`}
      onClose={onClose}
      busy={action.busy}
    >
      <form onSubmit={submit} className={FORM_CLASS}>
        <Notice error={action.error} />
        {Number(given) > 0 && wallet.average_cost !== null && (
          <p className="text-muted">
            Oddajesz {money(given, wallet.currency)}, które kosztowały Cię{" "}
            {money(Number(given) * Number(wallet.average_cost), "PLN")} — tyle
            samo będzie kosztować to, co dostaniesz.
          </p>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <label>
            Oddajesz ({wallet.currency})
            <input
              type="number"
              min="0.01"
              step="0.01"
              required
              value={given}
              onChange={(event) => setGiven(event.target.value)}
            />
            <small>Masz {money(wallet.balance, wallet.currency)}.</small>
          </label>
          <label>
            Do portfela
            <AppSelect
              ariaLabel="Portfel docelowy"
              value={targetId}
              onValueChange={setTargetId}
              options={targets.map((item) => ({
                value: String(item.id),
                label: `${item.currency} — ${item.account}`,
              }))}
            />
          </label>
          <label>
            Dostajesz {target ? `(${target.currency})` : ""}
            <input
              type="number"
              min="0.01"
              step="0.01"
              required
              value={received}
              onChange={(event) => setReceived(event.target.value)}
            />
          </label>
          <label>
            Data
            <input
              type="date"
              required
              value={day}
              onChange={(event) => setDay(event.target.value)}
            />
          </label>
        </div>
        <footer className="flex flex-wrap justify-end gap-2 border-t border-line pt-5">
          <button type="button" className="btn" onClick={onClose} disabled={action.busy}>
            Anuluj
          </button>
          <button className="btn-primary" disabled={action.busy || !target}>
            {action.busy ? "Zapisuję…" : "Wymień"}
          </button>
        </footer>
      </form>
    </Modal>
  );
}

function OpeningForm({
  wallet,
  onClose,
  onSaved,
}: {
  wallet: Wallet;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [amount, setAmount] = useState("");
  const [cost, setCost] = useState("");
  const [day, setDay] = useState(new Date().toLocaleDateString("en-CA"));
  const action = useAction(onSaved);
  const rate = Number(amount) > 0 ? Number(cost) / Number(amount) : 0;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const ok = await action.run(() =>
      request(`/wallets/${wallet.id}/opening`, "POST", {
        amount,
        pln_cost: cost,
        booking_date: day,
      }),
    );
    if (ok) onClose();
  }

  return (
    <Modal title={`Saldo otwarcia ${wallet.currency}`} onClose={onClose} busy={action.busy}>
      <form onSubmit={submit} className={FORM_CLASS}>
        <Notice error={action.error} />
        <p className="text-muted">
          Dla pieniędzy, które już masz, a których wymiany nie ma w żadnym
          wyciągu. Podaj ile i ile Cię kosztowały — choćby z pamięci. Lepsze
          przybliżenie niż brak kursu.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <label>
            Ile masz ({wallet.currency})
            <input
              type="number"
              min="0.01"
              step="0.01"
              required
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
            />
          </label>
          <label>
            Ile Cię kosztowały (zł)
            <input
              type="number"
              min="0"
              step="0.01"
              required
              value={cost}
              onChange={(event) => setCost(event.target.value)}
            />
          </label>
          <label>
            Od kiedy
            <input
              type="date"
              required
              value={day}
              onChange={(event) => setDay(event.target.value)}
            />
          </label>
        </div>
        {rate > 0 && (
          <p className="text-muted">Kurs wyjdzie {rateLabel(String(rate), wallet.currency)}.</p>
        )}
        <footer className="flex flex-wrap justify-end gap-2 border-t border-line pt-5">
          <button type="button" className="btn" onClick={onClose} disabled={action.busy}>
            Anuluj
          </button>
          <button className="btn-primary" disabled={action.busy}>
            {action.busy ? "Zapisuję…" : "Zapisz saldo"}
          </button>
        </footer>
      </form>
    </Modal>
  );
}

function WalletHistory({ wallet }: { wallet: Wallet }) {
  const { data, error, loading } = useResource<{ history: WalletEvent[] }>(
    `/wallets/${wallet.id}/history`,
  );
  const events = [...(data?.history ?? [])].reverse();
  if (loading && !data) {
    return <p className="py-3 text-sm text-muted">Wczytuję…</p>;
  }
  return (
    <>
      <Notice error={error} />
      {!events.length && (
        <p className="py-3 text-sm text-muted">
          Pusto. Zasil portfel z transakcji w Historii transakcji.
        </p>
      )}
      {events.length > 0 && (
        <table className="w-full table-fixed text-sm [&_td]:border-t [&_td]:border-line/40 [&_td]:py-2.5 [&_td]:pr-4 [&_td]:align-top [&_th]:pr-4 [&_th]:pb-2 [&_th]:text-left [&_th]:text-xs [&_th]:font-normal [&_th]:text-muted">
          <colgroup>
            <col className="w-28" />
            <col />
            <col className="w-44" />
            <col className="w-32" />
            <col className="w-32" />
          </colgroup>
          <thead>
            <tr>
              <th>Data</th>
              <th>Opis</th>
              <th>Rodzaj</th>
              <th className="text-right!">Kwota</th>
              <th className="text-right!">W złotówkach</th>
            </tr>
          </thead>
          <tbody>
            {events.map((event) => (
              <tr key={event.transaction_id}>
                <td className="text-muted tabular-nums">
                  {event.date.split("-").reverse().join(".")}
                </td>
                <td className="truncate">{event.description}</td>
                <td className="text-muted">
                  {EVENT_LABELS[event.kind]}
                  {event.kind === "topup" && event.rate && (
                    <span className="block text-xs">
                      {rateLabel(event.rate, wallet.currency)}
                    </span>
                  )}
                  {event.rate_known === false && (
                    <span className="block text-xs">brak kursu</span>
                  )}
                </td>
                <td className="text-right tabular-nums">
                  {money(event.amount, wallet.currency)}
                </td>
                <td className="text-right text-muted tabular-nums">
                  {money(event.pln, "PLN")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}

function WalletTile({
  wallet,
  selected,
  onSelect,
}: {
  wallet: Wallet;
  selected: boolean;
  onSelect: () => void;
}) {
  const cash = wallet.account.toLocaleLowerCase("pl") === "gotówka";
  const KindIcon = cash ? Banknote : Landmark;
  return (
    <button
      className={`card flex flex-col gap-5 p-5 text-left transition hover:ring-accent/50 ${selected ? "ring-2! ring-accent!" : ""}`}
      aria-pressed={selected}
      onClick={onSelect}
    >
      <span className="flex w-full items-center gap-3">
        <span className="grid h-8 shrink-0 place-items-center rounded-lg bg-accent-soft px-2 text-xs font-semibold tracking-wide text-accent ring-1 ring-accent/30">
          {wallet.currency}
        </span>
        <span className="min-w-0 flex-1 truncate text-sm text-muted">
          {wallet.account}
        </span>
        <KindIcon
          size={18}
          className="shrink-0 text-muted"
          aria-label={cash ? "Gotówka" : "Konto w banku"}
        />
      </span>
      <span>
        <strong className="block text-2xl font-semibold tracking-tight tabular-nums">
          {money(wallet.balance, wallet.currency)}
        </strong>
        <span className="block text-sm text-muted tabular-nums">
          {wallet.currency === "PLN"
            ? "\u00a0"
            : `≈ ${money(wallet.pln_value, "PLN")}`}
        </span>
        {wallet.currency !== "PLN" && wallet.average_cost !== null && (
          <span className="block text-xs text-muted tabular-nums">
            1 {wallet.currency} = {rateFormat.format(Number(wallet.average_cost))} zł
          </span>
        )}
      </span>
    </button>
  );
}

const ACTION_ROW_CLASS =
  "flex flex-1 items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition hover:bg-accent-soft hover:text-accent";

function WalletAction({
  icon: Icon,
  label,
  help,
  helpLabel,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  help: ReactNode;
  helpLabel: string;
  onClick: () => void;
}) {
  return (
    <li className="flex items-center gap-1">
      <button className={ACTION_ROW_CLASS} onClick={onClick}>
        <Icon size={16} className="shrink-0 text-muted" />
        {label}
      </button>
      <HelpPopover label={helpLabel}>{help}</HelpPopover>
    </li>
  );
}

function WalletDetail({
  wallet,
  canConvert,
  onDelete,
  onReconcile,
  onConvert,
  onOpening,
}: {
  wallet: Wallet;
  canConvert: boolean;
  onDelete: (wallet: Wallet) => void;
  onReconcile: (wallet: Wallet) => void;
  onConvert: (wallet: Wallet) => void;
  onOpening: (wallet: Wallet) => void;
}) {
  const uncovered = Number(wallet.uncovered);
  return (
    <section className="card p-6">
      {uncovered > 0 && (
        <p className="mb-6 flex items-center gap-3 rounded-xl bg-danger/10 px-4 py-3 text-sm leading-relaxed text-danger">
          <TriangleAlert size={17} />
          {money(uncovered, wallet.currency)} wydane bez zapisanego zasilenia —
          ta część nie wchodzi do sumy w złotówkach. Dodaj brakującą wymianę.
        </p>
      )}
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="min-w-0 overflow-x-auto">
          <WalletHistory wallet={wallet} />
        </div>
        <div>
          <ul className="flex flex-col gap-0.5">
            <WalletAction
              icon={Scale}
              label="Rozlicz"
              helpLabel="Jak działa rozliczenie"
              onClick={() => onReconcile(wallet)}
              help={
                <>
                  <strong className="text-ink">Przykład:</strong> wypłaciłeś
                  50 zł z bankomatu, po tygodniu w kieszeni masz 10 zł. Wpisujesz
                  „zostało 10 zł” — aplikacja wie, że wydałeś 40 zł, a Ty z
                  grubsza mówisz na co, np. 30 zł jedzenie i 10 zł transport.
                </>
              }
            />
            <WalletAction
              icon={ArrowDownToLine}
              label="Saldo otwarcia"
              helpLabel="Czym jest saldo otwarcia"
              onClick={() => onOpening(wallet)}
              help={
                <>
                  Punkt startowy, gdy wymiany nie ma w żadnym wyciągu.{" "}
                  <strong className="text-ink">Przykład:</strong> masz w
                  szufladzie 100 € kupione kiedyś za około 430 zł — wpisujesz
                  100 € i 430 zł.
                </>
              }
            />
            {canConvert && (
              <WalletAction
                icon={ArrowLeftRight}
                label="Wymień na inną walutę"
                helpLabel="Jak działa wymiana między portfelami"
                onClick={() => onConvert(wallet)}
                help={
                  <>
                    <strong className="text-ink">Przykład:</strong> wymieniasz
                    10 € na 110 dirhamów. Te 10 € kosztowało Cię 43,72 zł, więc
                    110 dirhamów też kosztuje 43,72 zł — nowych złotówek nie
                    wydałeś. Obiad za 55 dirhamów liczy się potem jako 21,86 zł.
                  </>
                }
              />
            )}
            <li className="flex pr-7">
              <button
                className={`${ACTION_ROW_CLASS} text-muted hover:bg-danger/10! hover:text-danger!`}
                onClick={() => onDelete(wallet)}
              >
                <Trash2 size={16} className="shrink-0" />
                Usuń portfel
              </button>
            </li>
          </ul>
        </div>
      </div>
    </section>
  );
}

export default function WalletsPage({
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
  const { data, error, loading } = useResource<{ wallets: Wallet[] }>(
    "/wallets",
    revision,
  );
  const [creating, setCreating] = useState(false);
  const [removing, setRemoving] = useState<Wallet | null>(null);
  const [reconciling, setReconciling] = useState<Wallet | null>(null);
  const [converting, setConverting] = useState<Wallet | null>(null);
  const [opening, setOpening] = useState<Wallet | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const action = useAction(() => {
    setRemoving(null);
    onChanged();
  });
  const wallets = data?.wallets ?? [];
  const selected =
    wallets.find((wallet) => wallet.id === selectedId) ?? wallets[0];
  return (
    <>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <h1>Portfele</h1>
          <HelpPopover label="Czym jest portfel">
            <div className="flex flex-col gap-3 [&_strong]:text-ink">
              <p>
                Bank widzi, że wymieniłeś złotówki na euro albo wypłaciłeś
                gotówkę. Nie widzi, na co potem je wydałeś. Portfel śledzi te
                pieniądze dalej.
              </p>
              <p>
                <strong>Przykład:</strong> wymieniasz 43,72 zł na 10 €. Portfel
                zapamiętuje, że 1 € kosztował Cię 4,372 zł. Kawa za 4 € liczy
                się potem w podsumowaniu jako 17,49 zł.
              </p>
            </div>
          </HelpPopover>
        </div>
        <button className="btn" onClick={() => setCreating(true)}>
          <Plus size={17} />
          Nowy portfel
        </button>
      </div>
      <Notice
        error={error || action.error}
        notice={action.notice}
        undoLabel={action.undoLabel}
        onUndo={action.undo}
      />
      {!wallets.length && !error && (
        <div className="card flex min-h-48 flex-col items-center justify-center gap-3 py-8 text-center text-sm text-muted">
          <h2>{loading ? "Wczytuję…" : "Brak portfeli"}</h2>
          {!loading && (
            <p>Załóż portfel na gotówkę w kieszeni albo na walutę z wymiany.</p>
          )}
        </div>
      )}
      {selected && (
        <>
          <div className="mb-6 grid grid-cols-[repeat(auto-fit,minmax(13rem,1fr))] gap-4">
            {wallets.map((wallet) => (
              <WalletTile
                key={wallet.id}
                wallet={wallet}
                selected={wallet.id === selected.id}
                onSelect={() => setSelectedId(wallet.id)}
              />
            ))}
          </div>
          <WalletDetail
            key={selected.id}
            wallet={selected}
            canConvert={wallets.length > 1 && Number(selected.balance) > 0}
            onDelete={setRemoving}
            onReconcile={setReconciling}
            onConvert={setConverting}
            onOpening={setOpening}
          />
        </>
      )}
      {creating && (
        <NewWalletForm
          accounts={accounts}
          onClose={() => setCreating(false)}
          onSaved={onChanged}
        />
      )}
      {converting && (
        <ConvertForm
          wallet={converting}
          wallets={wallets}
          onClose={() => setConverting(null)}
          onSaved={() => {
            setConverting(null);
            onChanged();
          }}
        />
      )}
      {opening && (
        <OpeningForm
          wallet={opening}
          onClose={() => setOpening(null)}
          onSaved={() => {
            setOpening(null);
            onChanged();
          }}
        />
      )}
      {reconciling && (
        <ReconcileForm
          wallet={reconciling}
          categories={categories}
          onClose={() => setReconciling(null)}
          onSaved={() => {
            setReconciling(null);
            onChanged();
          }}
        />
      )}
      {removing && (
        <Modal
          title="Usunąć portfel?"
          onClose={() => setRemoving(null)}
          busy={action.busy}
        >
          <div className={FORM_CLASS}>
            <p>
              {removing.currency} · {removing.account}
            </p>
            <p className="text-muted">
              Usunąć można tylko portfel bez transakcji. Same transakcje zostają
              nietknięte.
            </p>
            <Notice error={action.error} />
            <footer className="flex flex-wrap justify-end gap-2 border-t border-line pt-5">
              <button
                className="btn"
                onClick={() => setRemoving(null)}
                disabled={action.busy}
              >
                Anuluj
              </button>
              <button
                className="btn-danger"
                disabled={action.busy}
                onClick={() =>
                  action.run(() => request(`/wallets/${removing.id}`, "DELETE"))
                }
              >
                Usuń portfel
              </button>
            </footer>
          </div>
        </Modal>
      )}
    </>
  );
}
