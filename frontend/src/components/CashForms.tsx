import { useState, type FormEvent } from "react";
import { request, type Action } from "../hooks";
import { money } from "../api";
import { CurrencyInput, Modal, Notice } from "./Forms";

export type Withdrawal = {
  transactionId: number;
  date: string;
  account: string;
  bankAmount: string;
  bankCurrency: string;
  cashAmount: string | null;
  cashCurrency: string | null;
};

export function ForeignWithdrawalForm({
  withdrawal,
  expanded = false,
  onClose,
  action,
}: {
  withdrawal: Withdrawal;
  expanded?: boolean;
  onClose: () => void;
  action: Action;
}) {
  const mapped = withdrawal.cashCurrency !== null;
  const [foreign, setForeign] = useState(expanded || mapped);
  const [amount, setAmount] = useState(withdrawal.cashAmount ?? "");
  const [currency, setCurrency] = useState(withdrawal.cashCurrency ?? "");
  const path = `/cash/withdrawals/${withdrawal.transactionId}/currency`;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (await action.run(() => request(path, "PUT", { currency, amount }))) onClose();
  }

  return (
    <Modal title="Wypłata z bankomatu" onClose={onClose} busy={action.busy}>
      <form
        onSubmit={submit}
        className="flex flex-col gap-5 p-5 sm:p-6 [&>p]:text-sm [&_label]:flex [&_label]:flex-col [&_label]:gap-2 [&_label]:text-sm"
      >
        <Notice error={action.error} />
        <p className="text-muted">
          {withdrawal.date.split("-").reverse().join(".")} ·{" "}
          {money(withdrawal.bankAmount, withdrawal.bankCurrency)} z konta {withdrawal.account}
        </p>
        {!foreign && (
          <button
            type="button"
            className="self-start text-sm text-muted underline-offset-2 hover:text-accent hover:underline"
            onClick={() => setForeign(true)}
          >
            Wypłacone w innej walucie?
          </button>
        )}
        {foreign && (
          <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_6rem]">
            <label>
              Kwota w gotówce
              <input
                type="number"
                min="0.01"
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
          </div>
        )}
        <footer className="flex flex-wrap items-center gap-2 border-t border-line pt-5">
          {mapped && (
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
            {foreign ? "Anuluj" : "Zamknij"}
          </button>
          {foreign && (
            <button className="btn-primary" disabled={action.busy}>
              {action.busy ? "Zapisuję…" : "Zapisz"}
            </button>
          )}
        </footer>
      </form>
    </Modal>
  );
}
