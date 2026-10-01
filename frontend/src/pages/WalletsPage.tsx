import { useId, useState, type FormEvent } from "react";
import * as Accordion from "@radix-ui/react-accordion";
import { ChevronDown, Plus, Scale, Trash2, TriangleAlert } from "lucide-react";
import type { Wallet, WalletEvent } from "../domain";
import { request, useResource, useAction } from "../hooks";
import { money } from "../api";
import type { Category } from "../domain";
import { CategorySelect, CurrencyInput, Modal, Notice } from "../components/Forms";
import AppSelect from "../components/AppSelect";

const FORM_CLASS =
  "flex flex-col gap-5 p-5 sm:p-6 [&>p]:text-sm [&>p]:leading-relaxed [&_label]:flex [&_label]:flex-col [&_label]:gap-2 [&_label]:text-sm [&_label_small]:text-xs [&_label_small]:text-muted";
const BUTTON_CLASS =
  "inline-flex items-center justify-center gap-2 rounded-xl border border-line bg-surface px-4 py-2.5 text-sm font-medium shadow-sm transition hover:border-accent/30 hover:bg-accent-soft";
const PRIMARY_BUTTON_CLASS = `${BUTTON_CLASS} border-accent! bg-accent! text-white! shadow-accent/15 hover:bg-accent-hover!`;
const DANGER_BUTTON_CLASS = `${BUTTON_CLASS} border-danger/25! bg-danger/10! text-danger! hover:bg-danger/15!`;
const SMALL_BUTTON_CLASS =
  "inline-flex items-center justify-center gap-2 rounded-lg border border-line bg-surface px-3 py-1.5 text-xs font-medium transition hover:bg-accent-soft";

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
            className={BUTTON_CLASS}
            disabled={action.busy}
            onClick={onClose}
          >
            Anuluj
          </button>
          <button className={PRIMARY_BUTTON_CLASS} disabled={action.busy}>
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
              className={`${BUTTON_CLASS} self-start`}
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
            className={BUTTON_CLASS}
            onClick={onClose}
            disabled={action.busy}
          >
            Anuluj
          </button>
          <button
            className={PRIMARY_BUTTON_CLASS}
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
        <p className="text-muted">
          Żadne złotówki tu nie przechodzą, więc nowa waluta przejmuje dokładnie
          ten koszt, który miała poprzednia. Zysk ani strata nie powstają z samej
          wymiany.
        </p>
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
          <button type="button" className={BUTTON_CLASS} onClick={onClose} disabled={action.busy}>
            Anuluj
          </button>
          <button className={PRIMARY_BUTTON_CLASS} disabled={action.busy || !target}>
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
          <button type="button" className={BUTTON_CLASS} onClick={onClose} disabled={action.busy}>
            Anuluj
          </button>
          <button className={PRIMARY_BUTTON_CLASS} disabled={action.busy}>
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
      {events.map((event) => (
        <div
          key={event.transaction_id}
          className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-4 gap-y-1 border-t border-line py-2.5 text-sm"
        >
          <span className="min-w-0 truncate">{event.description}</span>
          <span className="tabular-nums">
            {money(event.amount, wallet.currency)}
          </span>
          <span className="text-xs text-muted">
            {event.date} · {EVENT_LABELS[event.kind]}
            {event.kind === "topup" &&
              event.rate &&
              ` · ${rateLabel(event.rate, wallet.currency)}`}
            {event.rate_known === false && " · brak kursu"}
          </span>
          <span className="text-xs text-muted tabular-nums">
            {money(event.pln, "PLN")}
          </span>
        </div>
      ))}
    </>
  );
}

function WalletRow({
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
    <Accordion.Item value={String(wallet.id)}>
      <div className="flex items-center gap-2 border-b border-line">
        <Accordion.Trigger className="group grid flex-1 grid-cols-2 items-baseline gap-x-4 gap-y-2 py-4 text-left sm:grid-cols-[11rem_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)]">
          <span className="flex items-center gap-2 text-sm">
            <ChevronDown
              size={15}
              className="shrink-0 text-muted transition group-data-[state=open]:rotate-180"
            />
            <strong className="font-semibold">{wallet.currency}</strong>
            <span className="text-muted">{wallet.account}</span>
          </span>
          <span className="text-right text-sm tabular-nums sm:text-left">
            {money(wallet.balance, wallet.currency)}
          </span>
          <span className="text-sm text-muted tabular-nums">
            {wallet.average_cost === null
              ? "—"
              : rateLabel(wallet.average_cost, wallet.currency)}
          </span>
          <span className="text-right text-sm tabular-nums">
            {money(wallet.pln_value, "PLN")}
          </span>
        </Accordion.Trigger>
        <button
          className="inline-grid size-9 shrink-0 place-items-center rounded-lg text-muted transition hover:bg-accent-soft hover:text-accent"
          aria-label={`Rozlicz portfel ${wallet.currency} ${wallet.account}`}
          title="Rozlicz: podaj, ile zostało"
          onClick={() => onReconcile(wallet)}
        >
          <Scale size={16} />
        </button>
        <button
          className="inline-grid size-9 shrink-0 place-items-center rounded-lg text-muted transition hover:bg-danger/10 hover:text-danger"
          aria-label={`Usuń portfel ${wallet.currency} ${wallet.account}`}
          onClick={() => onDelete(wallet)}
        >
          <Trash2 size={16} />
        </button>
      </div>
      {uncovered > 0 && (
        <p className="flex items-center gap-3 rounded-xl px-4 py-3 text-sm leading-relaxed bg-danger/10 text-danger">
          <TriangleAlert size={17} />
          {money(uncovered, wallet.currency)} wydane bez zapisanego zasilenia —
          ta część nie wchodzi do sumy w złotówkach. Dodaj brakującą wymianę.
        </p>
      )}
      <Accordion.Content className="overflow-hidden pb-4">
        <div className="flex flex-wrap gap-2 py-3">
          <button className={SMALL_BUTTON_CLASS} onClick={() => onOpening(wallet)}>
            Saldo otwarcia
          </button>
          {canConvert && (
            <button className={SMALL_BUTTON_CLASS} onClick={() => onConvert(wallet)}>
              Wymień na inną walutę
            </button>
          )}
        </div>
        <WalletHistory wallet={wallet} />
      </Accordion.Content>
    </Accordion.Item>
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
  const [expanded, setExpanded] = useState<string[]>([]);
  const action = useAction(() => {
    setRemoving(null);
    onChanged();
  });
  const wallets = data?.wallets ?? [];
  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
        <h1>Portfele</h1>
        <button className={BUTTON_CLASS} onClick={() => setCreating(true)}>
          <Plus size={17} />
          Nowy portfel
        </button>
      </div>
      <p className="mb-6 max-w-3xl text-sm leading-relaxed text-muted">
        Portfel pamięta, ile masz w kieszeni i ile Cię to kosztowało. Dla waluty
        obcej daje kurs z Twojej wymiany, a dla gotówki — odpowiedź na pytanie,
        na co właściwie poszła.
      </p>
      <Notice error={error || action.error} notice={action.notice} />
      <section className="border-t border-line">
        {wallets.length > 0 && (
          <div className="hidden grid-cols-[11rem_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_4.5rem] gap-4 border-b border-line py-3 text-xs font-semibold tracking-wide text-muted uppercase sm:grid">
            <span>Portfel</span>
            <span>Saldo</span>
            <span>Średni koszt</span>
            <span className="text-right">Wartość</span>
            <span />
          </div>
        )}
        <Accordion.Root
          type="multiple"
          value={expanded}
          onValueChange={setExpanded}
        >
          {wallets.map((wallet) => (
            <WalletRow
              key={wallet.id}
              wallet={wallet}
              canConvert={wallets.length > 1 && Number(wallet.balance) > 0}
              onDelete={setRemoving}
              onReconcile={setReconciling}
              onConvert={setConverting}
              onOpening={setOpening}
            />
          ))}
        </Accordion.Root>
        {!wallets.length && !error && (
          <div className="flex min-h-48 flex-col items-center justify-center gap-3 py-8 text-center text-sm text-muted">
            <h2>{loading ? "Wczytuję…" : "Brak portfeli"}</h2>
            {!loading && (
              <p>Załóż portfel na gotówkę w kieszeni albo na walutę z wymiany.</p>
            )}
          </div>
        )}
      </section>
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
                className={BUTTON_CLASS}
                onClick={() => setRemoving(null)}
                disabled={action.busy}
              >
                Anuluj
              </button>
              <button
                className={DANGER_BUTTON_CLASS}
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
    </div>
  );
}
