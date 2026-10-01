import { useId, useState, type FormEvent } from "react";
import { Plus } from "lucide-react";
import type { Wallet } from "../domain";
import { request, useResource, useAction } from "../hooks";
import { money } from "../api";
import { CurrencyInput, Modal, Notice } from "../components/Forms";

const FORM_CLASS =
  "flex flex-col gap-5 p-5 sm:p-6 [&>p]:text-sm [&>p]:leading-relaxed [&_label]:flex [&_label]:flex-col [&_label]:gap-2 [&_label]:text-sm [&_label_small]:text-xs [&_label_small]:text-muted";
const BUTTON_CLASS =
  "inline-flex items-center justify-center gap-2 rounded-xl border border-line bg-surface px-4 py-2.5 text-sm font-medium shadow-sm transition hover:border-accent/30 hover:bg-accent-soft";
const PRIMARY_BUTTON_CLASS = `${BUTTON_CLASS} border-accent! bg-accent! text-white! shadow-accent/15 hover:bg-accent-hover!`;

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

function WalletRow({ wallet }: { wallet: Wallet }) {
  return (
    <div className="grid grid-cols-2 items-baseline gap-x-4 gap-y-2 border-b border-line py-4 sm:grid-cols-[11rem_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)]">
      <span className="text-sm">
        <strong className="font-semibold">{wallet.currency}</strong>
        <span className="ml-2 text-muted">{wallet.account}</span>
      </span>
      <span className="text-right text-sm tabular-nums sm:text-left">
        {money(wallet.balance, wallet.currency)}
      </span>
      <span className="text-sm text-muted tabular-nums">
        {wallet.average_cost === null
          ? "—"
          : `${money(wallet.average_cost, "PLN")} / 1 ${wallet.currency}`}
      </span>
      <span className="text-right text-sm tabular-nums">
        {money(wallet.pln_value, "PLN")}
      </span>
    </div>
  );
}

export default function WalletsPage({
  accounts,
  revision,
  onChanged,
}: {
  accounts: string[];
  revision: number;
  onChanged: () => void;
}) {
  const { data, error, loading } = useResource<{ wallets: Wallet[] }>(
    "/wallets",
    revision,
  );
  const [creating, setCreating] = useState(false);
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
        Portfel pamięta, ile masz w kieszeni i ile Cię to kosztowało. Dla
        waluty obcej daje kurs z Twojej wymiany, a dla gotówki — odpowiedź na
        pytanie, na co właściwie poszła.
      </p>
      <Notice error={error} />
      <section className="border-t border-line">
        {wallets.length > 0 && (
          <div className="hidden grid-cols-[11rem_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)] gap-4 border-b border-line py-3 text-xs font-semibold tracking-wide text-muted uppercase sm:grid">
            <span>Portfel</span>
            <span>Saldo</span>
            <span>Średni koszt</span>
            <span className="text-right">Wartość</span>
          </div>
        )}
        {wallets.map((wallet) => (
          <WalletRow key={wallet.id} wallet={wallet} />
        ))}
        {!wallets.length && !error && (
          <div className="flex min-h-48 flex-col items-center justify-center gap-3 py-8 text-center text-sm text-muted">
            <h2>{loading ? "Wczytuję…" : "Brak portfeli"}</h2>
            {!loading && (
              <p>
                Załóż portfel na gotówkę w kieszeni albo na walutę z wymiany.
              </p>
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
    </div>
  );
}
