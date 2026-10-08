import { useState, type FormEvent } from "react";
import type { Wallet } from "../domain";
import { request, useAction, useResource, type Action } from "../hooks";
import { money } from "../api";
import { Modal, Notice } from "../components/Forms";
import HelpPopover from "../components/HelpPopover";
import { WALLET_GRID_CLASS, WalletHistory, WalletTile } from "../components/WalletParts";

function dayLabel(value: string) {
  return value.split("-").reverse().join(".");
}

function HeldBeforeForm({
  wallet,
  onClose,
  action,
}: {
  wallet: Wallet;
  onClose: () => void;
  action: Action;
}) {
  const held = wallet.held_before!;
  const [cost, setCost] = useState(
held.pln ?? "",
  );
  const path = `/wallets/${wallet.id}/opening-rate`;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (await action.run(() => request(path, "PUT", { pln_cost: cost }))) onClose();
  }

  return (
    <Modal title={`Kurs ${wallet.currency}`} onClose={onClose} busy={action.busy}>
      <form
        onSubmit={submit}
        className="flex flex-col gap-5 p-5 sm:p-6 [&_label]:flex [&_label]:flex-col [&_label]:gap-2 [&_label]:text-sm"
      >
        <Notice error={action.error} />
        <label>
          Ile kosztowało {money(held.amount, wallet.currency)} sprzed{" "}
          {dayLabel(held.date)}? (zł)
          <input
            type="number"
            min="0.01"
            step="0.01"
            required
            autoFocus
            value={cost}
            onChange={(event) => setCost(event.target.value)}
          />
        </label>
        <p className="text-sm text-muted">
          Masz starszy wyciąg z tą wymianą? Wgraj go, kurs uzupełni się sam.
        </p>
        <footer className="flex flex-wrap items-center gap-2 border-t border-line pt-5">
          {held.rate_known && (
            <button
              type="button"
              className="btn-danger mr-auto"
              disabled={action.busy}
              onClick={async () => {
                if (await action.run(() => request(path, "DELETE"))) onClose();
              }}
            >
              Usuń
            </button>
          )}
          <button type="button" className="btn ml-auto" onClick={onClose} disabled={action.busy}>
            Anuluj
          </button>
          <button className="btn-primary" disabled={action.busy}>
            {action.busy ? "Zapisuję…" : "Zapisz"}
          </button>
        </footer>
      </form>
    </Modal>
  );
}

function HeldBeforeLine({ wallet, onEdit }: { wallet: Wallet; onEdit: () => void }) {
  const held = wallet.held_before;
  if (!held) return null;
  const amount = `${money(held.amount, wallet.currency)} sprzed ${dayLabel(held.date)}`;
  return (
    <div className="mb-5 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-line px-4 py-3 text-sm">
      {held.rate_known ? (
        <span className="text-muted">
          {amount} · {money(held.pln!, "PLN")}, podane ręcznie
        </span>
      ) : (
        <span>Brak kursu dla {amount}</span>
      )}
      <button className="btn ml-auto" onClick={onEdit}>
        {held.rate_known ? "Zmień" : "Uzupełnij"}
      </button>
    </div>
  );
}

export default function CurrenciesPage({
  revision,
  onChanged,
}: {
  revision: number;
  onChanged: () => void;
}) {
  const { data, error, loading } = useResource<{ wallets: Wallet[] }>("/wallets", revision);
  const action = useAction(onChanged);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [editing, setEditing] = useState<Wallet | null>(null);
  const wallets = (data?.wallets ?? []).filter(
    (wallet) => wallet.kind === "bank" && wallet.currency !== "PLN",
  );
  const selected = wallets.find((wallet) => wallet.id === selectedId) ?? wallets[0];
  return (
    <>
      <div className="mb-6 flex items-center gap-2">
        <h1>Waluty</h1>
        <HelpPopover label="Skąd się biorą kursy">
          <p>
            Kurs pochodzi z Twoich wymian w wyciągach. Wydatki w walucie liczą
            się w złotówkach po tym, ile naprawdę kosztowała Cię ta waluta.
          </p>
        </HelpPopover>
      </div>
      <Notice
        error={error || (editing ? "" : action.error)}
        notice={action.notice} undoLabel={action.undoLabel} onUndo={action.undo}
        onDismiss={action.dismiss} />
      {!wallets.length && !error && (
        <div className="card flex min-h-48 items-center justify-center px-6 py-10 text-sm text-muted">
          {loading ? "Wczytuję…" : "Nie masz walut na kontach."}
        </div>
      )}
      {selected && (
        <>
          <div className={WALLET_GRID_CLASS}>
            {wallets.map((wallet) => (
              <WalletTile
                key={wallet.id}
                wallet={wallet}
                selected={wallet.id === selected.id}
                onSelect={() => setSelectedId(wallet.id)}
              />
            ))}
          </div>
          <section className="card p-6">
            <HeldBeforeLine wallet={selected} onEdit={() => setEditing(selected)} />
            <div className="min-w-0 overflow-x-auto">
              <WalletHistory key={selected.id} wallet={selected} revision={revision} />
            </div>
          </section>
        </>
      )}
      {editing && (
        <HeldBeforeForm
          wallet={editing}
          onClose={() => setEditing(null)}
          action={action}
        />
      )}
    </>
  );
}
