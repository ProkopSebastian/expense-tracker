import { useState, type FormEvent } from "react";
import type { Category, Block } from "../domain";
import { request, useAction } from "../hooks";
import { money } from "../api";
import { Modal, CategorySelect, Notice } from "./Forms";
export function ManualForm({
  categories,
  onClose,
  onSaved,
}: {
  categories: Category[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [category, setCategory] = useState("");
  const action = useAction(onSaved);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const amount = String(f.get("amount"));
    const ok = await action.run(() =>
      request("/transactions", "POST", {
        account: f.get("account"),
        booking_date: f.get("date"),
        amount: f.get("direction") === "expense" ? `-${amount}` : amount,
        currency: f.get("currency"),
        description: f.get("description"),
        counterparty: f.get("counterparty") || null,
        category_key: category,
      }),
    );
    if (ok) onClose();
  }
  return (
    <Modal title="Dodaj transakcję" onClose={onClose} busy={action.busy}>
      <form
        onSubmit={submit}
        className="flex flex-col gap-5 p-5 sm:p-6 [&>p]:text-sm [&>p]:leading-relaxed [&_label]:flex [&_label]:flex-col [&_label]:gap-2 [&_label]:text-sm [&_label_small]:text-xs [&_label_small]:text-muted [&_summary]:cursor-pointer [&_summary]:text-sm [&_details_label]:mt-3"
      >
        <Notice error={action.error} />
        <div className="grid gap-4 sm:grid-cols-2">
          <label>
            Data
            <input
              type="date"
              name="date"
              required
              defaultValue={new Date().toLocaleDateString("en-CA")}
            />
          </label>
          <label>
            Konto / źródło
            <input
              name="account"
              required
              defaultValue="Gotówka"
              maxLength={500}
            />
          </label>
          <label>
            Rodzaj
            <select name="direction">
              <option value="expense">Wydatek</option>
              <option value="income">Przychód</option>
            </select>
          </label>
          <label>
            Kwota
            <input
              name="amount"
              type="number"
              min="0.01"
              step="0.01"
              required
            />
          </label>
          <label>
            Waluta
            <select name="currency">
              {["PLN", "EUR", "USD", "GBP"].map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
          <label>
            Kategoria
            <CategorySelect
              categories={categories}
              value={category}
              onChange={setCategory}
            />
          </label>
        </div>
        <label>
          Opis
          <input
            name="description"
            required
            maxLength={500}
            placeholder="Na przykład: zakupy na targu"
          />
        </label>
        <label>
          Kontrahent <small>opcjonalnie</small>
          <input name="counterparty" />
        </label>
        <footer className="flex flex-wrap justify-end gap-2 border-t border-line pt-5">
          <button
            type="button"
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-line bg-white px-4 py-2.5 text-sm font-medium shadow-sm transition hover:border-accent/30 hover:bg-accent-soft"
            disabled={action.busy}
            onClick={onClose}
          >
            Anuluj
          </button>
          <button
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-line bg-white px-4 py-2.5 text-sm font-medium shadow-sm transition hover:border-accent/30 hover:bg-accent-soft border-accent! bg-accent! text-white! shadow-accent/15 hover:bg-accent-hover!"
            disabled={action.busy}
          >
            {action.busy ? "Zapisuję…" : "Dodaj transakcję"}
          </button>
        </footer>
      </form>
    </Modal>
  );
}
const kinds: Record<string, string> = {
  shared_purchase: "Wspólny zakup",
  reimbursement: "Rozliczenie",
  refund: "Zwrot od sprzedawcy",
  own_transfer: "Transfer między moimi kontami",
  payment_dispute: "Sporna lub cofnięta płatność",
};
const roles: Record<string, string> = {
  purchase: "Zakup",
  received_reimbursement: "Zwrot od znajomego",
  paid_settlement: "Spłata rozliczenia",
  received_refund: "Zwrot od sprzedawcy",
  account_transfer: "Przelew między kontami",
};
function defaultRole(kind: string, amount: number) {
  if (kind === "own_transfer") return "account_transfer";
  if (kind === "refund" && amount > 0) return "received_refund";
  if (kind === "reimbursement")
    return amount < 0 ? "paid_settlement" : "received_reimbursement";
  return amount > 0 ? "received_reimbursement" : "purchase";
}
export function GroupForm({
  selected,
  categories,
  onClose,
  onSaved,
}: {
  selected: Block[];
  categories: Category[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [kind, setKind] = useState("shared_purchase"),
    [category, setCategory] = useState(""),
    [overrides, setOverrides] = useState<Record<number, string>>({});
  const action = useAction(onSaved);
  const total = selected.reduce((sum, row) => sum + Number(row.amount), 0),
    currency = selected[0].currency;
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const amount = String(f.get("amount") || "0");
    const ok = await action.run(() =>
      request("/cases", "POST", {
        title: f.get("title"),
        kind,
        category_key: kind === "own_transfer" ? "transfer_own" : category,
        currency,
        personal_amount:
          f.get("direction") === "income" ? `-${amount}` : amount,
        members: selected.map((row) => ({
          transaction_id: row.id,
          role: overrides[row.id!] ?? defaultRole(kind, Number(row.amount)),
        })),
      }),
    );
    if (ok) onClose();
  }
  return (
    <Modal
      title="Połącz transakcje w grupę"
      onClose={onClose}
      busy={action.busy}
    >
      <form
        onSubmit={submit}
        className="flex flex-col gap-5 p-5 sm:p-6 [&>p]:text-sm [&>p]:leading-relaxed [&_label]:flex [&_label]:flex-col [&_label]:gap-2 [&_label]:text-sm [&_label_small]:text-xs [&_label_small]:text-muted [&_summary]:cursor-pointer [&_summary]:text-sm [&_details_label]:mt-3"
      >
        <Notice error={action.error} />
        <p className="text-sm leading-relaxed text-muted">
          {selected.length} transakcje · suma przepływów{" "}
          {money(total, currency)}. W podsumowaniu grupa będzie jedną pozycją na
          kwotę Twojego rzeczywistego kosztu.
        </p>
        <label>
          Nazwa grupy
          <input
            name="title"
            required
            maxLength={500}
            placeholder="Na przykład: wspólna kolacja"
          />
        </label>
        <label>
          Rodzaj grupy
          <select
            value={kind}
            onChange={(e) => {
              setKind(e.target.value);
              setOverrides({});
            }}
          >
            {Object.entries(kinds).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        {kind === "own_transfer" ? (
          <p className="mb-5 flex items-center gap-3 rounded-xl px-4 py-3 text-sm leading-relaxed [&_svg]:shrink-0 bg-emerald-50 text-emerald-700">
            Transfer własny nie zwiększa wydatków ani przychodów.
          </p>
        ) : (
          <>
            <label>
              Kategoria
              <CategorySelect
                categories={categories}
                value={category}
                onChange={setCategory}
              />
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label>
                Kierunek
                <select
                  name="direction"
                  defaultValue={total > 0 ? "income" : "expense"}
                >
                  <option value="expense">Wydatek</option>
                  <option value="income">Zwrot na moją korzyść</option>
                </select>
              </label>
              <label>
                Twój rzeczywisty koszt ({currency})
                <input
                  name="amount"
                  type="number"
                  min="0"
                  step="0.01"
                  required
                  defaultValue={Math.abs(total).toFixed(2)}
                />
              </label>
            </div>
          </>
        )}
        <details>
          <summary>Role transakcji</summary>
          <p className="text-sm leading-relaxed text-muted">
            Opisowe role nie zmieniają podanej kwoty kosztu.
          </p>
          {selected.map((row) => (
            <label key={row.id}>
              {row.description} · {money(row.amount!, currency)}
              <select
                value={
                  overrides[row.id!] ?? defaultRole(kind, Number(row.amount))
                }
                onChange={(e) =>
                  setOverrides({ ...overrides, [row.id!]: e.target.value })
                }
              >
                {Object.entries(roles).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </details>
        <footer className="flex flex-wrap justify-end gap-2 border-t border-line pt-5">
          <button
            type="button"
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-line bg-white px-4 py-2.5 text-sm font-medium shadow-sm transition hover:border-accent/30 hover:bg-accent-soft"
            onClick={onClose}
            disabled={action.busy}
          >
            Anuluj
          </button>
          <button
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-line bg-white px-4 py-2.5 text-sm font-medium shadow-sm transition hover:border-accent/30 hover:bg-accent-soft border-accent! bg-accent! text-white! shadow-accent/15 hover:bg-accent-hover!"
            disabled={action.busy}
          >
            {action.busy ? "Zapisuję…" : "Utwórz grupę"}
          </button>
        </footer>
      </form>
    </Modal>
  );
}
