import { useState, type FormEvent } from "react";
import type { Category, Block, GroupCase } from "../domain";
import { request, useResource, type Action } from "../hooks";
import { money } from "../api";
import { Modal, CategorySelect, CurrencyInput, Notice } from "./Forms";
import AppSelect from "./AppSelect";
const CASH_ACCOUNT = "Gotówka";
const OTHER_ACCOUNT = "__other";

export function ManualForm({
  existing,
  accounts,
  categories,
  onClose,
  action,
}: {
  existing?: Block;
  accounts: string[];
  categories: Category[];
  onClose: () => void;
  action: Action;
}) {
  const [category, setCategory] = useState(existing?.category_key ?? "");
  const [categoryMissing, setCategoryMissing] = useState(false);
  const [account, setAccount] = useState(existing?.account ?? CASH_ACCOUNT);
  const [confirming, setConfirming] = useState(false);
  const accountOptions = [
    CASH_ACCOUNT,
    ...accounts.filter((name) => name !== CASH_ACCOUNT),
    ...(existing && !accounts.includes(existing.account) && existing.account !== CASH_ACCOUNT ? [existing.account] : []),
  ];
  const signed = Number(existing?.amount ?? 0);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!category) {
      setCategoryMissing(true);
      return;
    }
    const f = new FormData(e.currentTarget);
    const amount = String(f.get("amount"));
    const ok = await action.run(() =>
      request(existing ? `/transactions/${existing.id}` : "/transactions", existing ? "PUT" : "POST", {
        account: account === OTHER_ACCOUNT ? f.get("account") : account,
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
    <Modal title={existing ? "Wpis ręczny" : "Dodaj transakcję"} onClose={onClose} busy={action.busy}>
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
              defaultValue={existing?.date ?? new Date().toLocaleDateString("en-CA")}
            />
          </label>
          <label>
            Konto
            <AppSelect
              ariaLabel="Konto"
              value={account}
              onValueChange={setAccount}
              options={[
                ...accountOptions.map((name) => ({ value: name, label: name })),
                { value: OTHER_ACCOUNT, label: "Inne konto…" },
              ]}
            />
            {account === OTHER_ACCOUNT && (
              <input name="account" required autoFocus maxLength={500} aria-label="Nazwa konta" />
            )}
          </label>
          <label>
            Rodzaj
            <AppSelect
              ariaLabel="Rodzaj"
              name="direction"
              defaultValue={signed > 0 ? "income" : "expense"}
              options={[
                { value: "expense", label: "Wydatek" },
                { value: "income", label: "Przychód" },
              ]}
            />
          </label>
          <label>
            Kwota
            <input
              name="amount"
              type="number"
              min="0.01"
              step="0.01"
              required
              defaultValue={existing ? Math.abs(signed).toFixed(2) : undefined}
            />
          </label>
          <label>
            Waluta
            <CurrencyInput name="currency" ariaLabel="Waluta" defaultValue={existing?.currency ?? "PLN"} />
          </label>
          <label>
            Kategoria
            <CategorySelect
              categories={categories}
              value={category}
              onChange={(value) => {
                setCategory(value);
                setCategoryMissing(false);
              }}
            />
            {categoryMissing && <small className="text-danger!">Wybierz kategorię.</small>}
          </label>
        </div>
        <label>
          Opis
          <input
            name="description"
            required
            maxLength={500}
            placeholder="Na przykład: zakupy na targu"
            defaultValue={existing?.description}
          />
        </label>
        <label>
          Kontrahent <small>opcjonalnie</small>
          <input
            name="counterparty"
            defaultValue={existing?.counterparty && existing.counterparty !== "—" ? existing.counterparty : undefined}
          />
        </label>
        {confirming ? (
          <footer className="flex flex-wrap items-center gap-2 border-t border-line pt-5">
            <span className="mr-auto text-sm">Usunąć ten wpis?</span>
            <button type="button" className="btn" onClick={() => setConfirming(false)} disabled={action.busy}>
              Nie
            </button>
            <button
              type="button"
              className="btn-danger"
              disabled={action.busy}
              onClick={async () => {
                if (await action.run(() => request(`/transactions/${existing!.id}`, "DELETE"))) onClose();
              }}
            >
              Usuń
            </button>
          </footer>
        ) : (
          <footer className="flex flex-wrap items-center gap-2 border-t border-line pt-5">
            {existing && (
              <button
                type="button"
                className="btn-danger mr-auto"
                disabled={action.busy}
                onClick={() => setConfirming(true)}
              >
                Usuń
              </button>
            )}
            <button type="button" className="btn ml-auto" disabled={action.busy} onClick={onClose}>
              Anuluj
            </button>
            <button className="btn-primary" disabled={action.busy}>
              {action.busy ? "Zapisuję…" : existing ? "Zapisz" : "Dodaj transakcję"}
            </button>
          </footer>
        )}
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
  existing,
  categories,
  onClose,
  action,
}: {
  selected: Block[];
  existing?: GroupCase;
  categories: Category[];
  onClose: () => void;
  action: Action;
}) {
  const [kind, setKind] = useState(existing?.kind ?? "shared_purchase"),
    [category, setCategory] = useState(existing?.category_key ?? ""),
    [categoryMissing, setCategoryMissing] = useState(false),
    [overrides, setOverrides] = useState<Record<number, string>>({});
  const costQuery = new URLSearchParams();
  selected.forEach((row) => costQuery.append("transaction_id", String(row.id)));
  if (existing) costQuery.append("case_id", String(existing.id));
  const { data: cost } = useResource<{ currency: string; total: string; missing: number }>(
    `/cases/cost?${costQuery}`,
  );
  const total = Number(cost?.total ?? 0);
  const mixed = cost?.currency === "PLN" && selected.some((row) => row.currency !== "PLN");
  const firstDate = selected.map((row) => row.date).sort()[0];
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!cost) return;
    const f = new FormData(e.currentTarget);
    const amount = String(f.get("amount") || "0");
    if (kind !== "own_transfer" && !category) {
      setCategoryMissing(true);
      return;
    }
    const fields = {
      title: f.get("title"),
      kind,
      category_key: kind === "own_transfer" ? "transfer_own" : category,
      currency: cost.currency,
      personal_amount: f.get("direction") === "income" ? `-${amount}` : amount,
      booked_on: f.get("booked_on"),
    };
    const ok = await action.run(
      () =>
        existing
          ? request(`/cases/${existing.id}`, "PUT", { ...fields, add: selected.map((row) => row.id) })
          : request("/cases", "POST", {
              ...fields,
              members: selected.map((row) => ({
                transaction_id: row.id,
                role: overrides[row.id!] ?? defaultRole(kind, Number(row.amount)),
              })),
            }),
      existing ? "Grupa zapisana." : "Grupa utworzona.",
    );
    if (ok) onClose();
  }
  return (
    <Modal
      title={existing ? "Edytuj grupę" : "Połącz transakcje w grupę"}
      onClose={onClose}
      busy={action.busy}
    >
      <form
        onSubmit={submit}
        className="flex flex-col gap-5 p-5 sm:p-6 [&>p]:text-sm [&>p]:leading-relaxed [&_label]:flex [&_label]:flex-col [&_label]:gap-2 [&_label]:text-sm [&_label_small]:text-xs [&_label_small]:text-muted [&_summary]:cursor-pointer [&_summary]:text-sm [&_details_label]:mt-3"
      >
        <Notice error={action.error} />
        <p className="text-sm leading-relaxed text-muted">
          {existing
            ? selected.length > 0 &&
              `Dopisywane transakcje: ${selected.length}. Podany koszt obejmuje dotychczasowy koszt grupy i te transakcje.`
            : cost &&
              `${selected.length} transakcje · suma przepływów ${money(total, cost.currency)}${mixed ? " po Twoich kursach" : ""}.`}{" "}
          W podsumowaniu grupa będzie jedną pozycją na kwotę Twojego rzeczywistego kosztu.
        </p>
        {mixed && (
          <ul className="rounded-xl border border-line px-4 py-3 text-sm [&_li]:flex [&_li]:justify-between [&_li]:gap-4 [&_li]:py-1">
            {selected.map((row) => (
              <li key={row.id}>
                <span className="min-w-0 truncate text-muted">
                  {row.description}
                </span>
                <span className="shrink-0 tabular-nums">
                  {money(row.amount!, row.currency)}
                  {row.currency !== "PLN" && (
                    <span className="ml-2 text-muted">
                      {row.pln_amount == null
                        ? "brak kursu"
                        : money(row.pln_amount, "PLN")}
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
        {(cost?.missing ?? 0) > 0 && (
          <p className="flex items-center gap-3 rounded-xl px-4 py-3 text-sm leading-relaxed bg-danger/10 text-danger">
            Część transakcji nie ma kursu, więc suma w złotówkach jest niepełna.
            Zasil najpierw ich portfel albo podaj saldo otwarcia.
          </p>
        )}
        <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
          <label>
            Nazwa grupy
            <input
              name="title"
              required
              maxLength={500}
              defaultValue={existing?.title}
              placeholder="Na przykład: wspólna kolacja"
            />
          </label>
          <label>
            Data
            <input
              name="booked_on"
              type="date"
              required
              defaultValue={existing?.booking_date ?? firstDate}
            />
          </label>
        </div>
        <label>
          Rodzaj grupy
          <AppSelect
            ariaLabel="Rodzaj grupy"
            value={kind}
            onValueChange={(value) => {
              setKind(value);
              setOverrides({});
            }}
            options={Object.entries(kinds).map(([value, label]) => ({
              value,
              label,
            }))}
          />
        </label>
        {kind === "own_transfer" ? (
          <p className="mb-5 flex items-center gap-3 rounded-xl px-4 py-3 text-sm leading-relaxed [&_svg]:shrink-0 bg-success/10 text-success">
            Transfer własny nie zwiększa wydatków ani przychodów.
          </p>
        ) : (
          <>
            <label>
              Kategoria
              <CategorySelect
                categories={categories}
                value={category}
                onChange={(value) => {
                  setCategory(value);
                  setCategoryMissing(false);
                }}
              />
              {categoryMissing && <small className="text-danger!">Wybierz kategorię.</small>}
            </label>
            {cost && (
              <div className="grid gap-4 sm:grid-cols-2">
                <label>
                  Kierunek
                  <AppSelect
                    ariaLabel="Kierunek"
                    name="direction"
                    defaultValue={total > 0 ? "income" : "expense"}
                    options={[
                      { value: "expense", label: "Wydatek" },
                      { value: "income", label: "Zwrot na moją korzyść" },
                    ]}
                  />
                </label>
                <label>
                  Twój rzeczywisty koszt ({cost.currency})
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
            )}
          </>
        )}
        {!existing && (
          <details>
            <summary>Role transakcji</summary>
            <p className="text-sm leading-relaxed text-muted">
              Opisowe role nie zmieniają podanej kwoty kosztu.
            </p>
            {selected.map((row) => (
              <label key={row.id}>
                {row.description} · {money(row.amount!, row.currency)}
                <AppSelect
                  ariaLabel={`Rola transakcji ${row.description}`}
                  value={
                    overrides[row.id!] ?? defaultRole(kind, Number(row.amount))
                  }
                  onValueChange={(value) =>
                    setOverrides({ ...overrides, [row.id!]: value })
                  }
                  options={Object.entries(roles).map(([value, label]) => ({
                    value,
                    label,
                  }))}
                />
              </label>
            ))}
          </details>
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
            disabled={action.busy || !cost}
          >
            {action.busy ? "Zapisuję…" : existing ? "Zapisz grupę" : "Utwórz grupę"}
          </button>
        </footer>
      </form>
    </Modal>
  );
}
