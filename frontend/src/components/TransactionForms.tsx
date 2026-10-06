import { useMemo, useState, type FormEvent } from "react";
import type { Category, Block, Wallet } from "../domain";
import { request, useAction, useResource } from "../hooks";
import { money } from "../api";
import { Modal, CategorySelect, CurrencyInput, Notice } from "./Forms";
import AppSelect from "./AppSelect";
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
  const [walletId, setWalletId] = useState("");
  const { data } = useResource<{ wallets: Wallet[] }>("/wallets");
  const wallets = data?.wallets ?? [];
  const wallet = wallets.find((item) => String(item.id) === walletId);
  const action = useAction(onSaved);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const amount = String(f.get("amount"));
    const ok = await action.run(() =>
      request("/transactions", "POST", {
        // A wallet decides the account and currency server-side; these are only a fallback.
        account: wallet ? wallet.account : f.get("account"),
        booking_date: f.get("date"),
        amount: f.get("direction") === "expense" ? `-${amount}` : amount,
        currency: wallet ? wallet.currency : f.get("currency"),
        description: f.get("description"),
        counterparty: f.get("counterparty") || null,
        category_key: category,
        wallet_id: wallet ? wallet.id : null,
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
            {wallets.length > 0 && (
              <AppSelect
                ariaLabel="Konto lub portfel"
                value={walletId}
                onValueChange={setWalletId}
                options={[
                  { value: "", label: "Wpiszę ręcznie", group: "Bez portfela" },
                  ...wallets.map((item) => ({
                    value: String(item.id),
                    label: `${item.currency} — ${item.account} · ${money(item.balance, item.currency)}`,
                    group: "Portfele",
                  })),
                ]}
              />
            )}
            {!wallet && (
              <input name="account" required defaultValue="Gotówka" maxLength={500} />
            )}
          </label>
          <label>
            Rodzaj
            <AppSelect
              ariaLabel="Rodzaj"
              name="direction"
              defaultValue="expense"
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
            />
          </label>
          {wallet ? (
            <label>
              Waluta
              <input value={wallet.currency} readOnly aria-readonly />
              <small>Z portfela — nie trzeba jej wybierać.</small>
            </label>
          ) : (
            <label>
              Waluta
              <CurrencyInput name="currency" ariaLabel="Waluta" defaultValue="PLN" />
            </label>
          )}
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
            className="btn"
            disabled={action.busy}
            onClick={onClose}
          >
            Anuluj
          </button>
          <button
            className="btn-primary"
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
  const currencies = [...new Set(selected.map((row) => row.currency))];
  const mixed = currencies.length > 1;
  // A group spanning currencies has no native unit; złoty is the only common one.
  const currency = mixed ? "PLN" : currencies[0];
  // A złoty row carries no separate converted value because it already is one.
  const inPln = (row: Block) =>
    row.currency === "PLN" ? Number(row.amount) : Number(row.pln_amount ?? 0);
  const total = selected.reduce(
    (sum, row) => sum + (mixed ? inPln(row) : Number(row.amount)),
    0,
  );
  const unconvertible = selected.filter(
    (row) => mixed && row.currency !== "PLN" && row.pln_amount == null,
  );
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
          {selected.length} transakcje · suma przepływów {money(total, currency)}
          {mixed && " po Twoich kursach"}. W podsumowaniu grupa będzie jedną
          pozycją na kwotę Twojego rzeczywistego kosztu.
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
        {unconvertible.length > 0 && (
          <p className="flex items-center gap-3 rounded-xl px-4 py-3 text-sm leading-relaxed bg-danger/10 text-danger">
            Część transakcji nie ma kursu, więc suma w złotówkach jest niepełna.
            Zasil najpierw ich portfel albo podaj saldo otwarcia.
          </p>
        )}
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
                onChange={setCategory}
              />
            </label>
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
            disabled={action.busy}
          >
            {action.busy ? "Zapisuję…" : "Utwórz grupę"}
          </button>
        </footer>
      </form>
    </Modal>
  );
}

const rateFormat = new Intl.NumberFormat("pl-PL", {
  minimumFractionDigits: 4,
  maximumFractionDigits: 4,
});

export function FundWalletForm({
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
  const { data } = useResource<{ wallets: Wallet[] }>("/wallets");
  const wallets = useMemo(() => data?.wallets ?? [], [data]);
  const source = selected.find((row) => Number(row.amount) < 0)!;
  const target = selected.find((row) => Number(row.amount) > 0) ?? null;
  const paired = wallets.find(
    (wallet) => target && wallet.account === target.account && wallet.currency === target.currency,
  );
  const [walletId, setWalletId] = useState("");
  const [received, setReceived] = useState(
    target ? Math.abs(Number(target.amount)).toFixed(2) : "",
  );
  const [fee, setFee] = useState("0");
  const [feeCategory, setFeeCategory] = useState("fees_fx");
  const action = useAction(onSaved);

  const given = Math.abs(Number(source.amount));
  const amount = Number(received);
  const rate = amount > 0 ? given / amount : 0;
  const chosen = target ? paired : wallets.find((wallet) => String(wallet.id) === walletId);
  const needsNewWallet = Boolean(target) && !paired;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const ok = await action.run(async () => {
      let id = chosen?.id;
      if (needsNewWallet && target) {
        const created = await request<{ id: number }>("/wallets", "POST", {
          account: target.account,
          currency: target.currency,
        });
        id = created.id;
      }
      if (!id) throw new Error("Wybierz portfel, który ma zostać zasilony.");
      await request(`/wallets/${id}/fund`, "POST", {
        source_transaction_id: source.id,
        target_transaction_id: target ? target.id : null,
        received_amount: target ? null : received,
        fee_amount: fee || "0",
        fee_category_key: Number(fee) > 0 ? feeCategory : null,
      });
    });
    if (ok) onClose();
  }

  return (
    <Modal title="Zasil portfel" onClose={onClose} busy={action.busy}>
      <form
        onSubmit={submit}
        className="flex flex-col gap-5 p-5 sm:p-6 [&>p]:text-sm [&>p]:leading-relaxed [&_label]:flex [&_label]:flex-col [&_label]:gap-2 [&_label]:text-sm [&_label_small]:text-xs [&_label_small]:text-muted [&_summary]:cursor-pointer [&_summary]:text-sm [&_details_label]:mt-3"
      >
        <Notice error={action.error} />
        <p className="text-muted">
          {target
            ? "Obie strony wymiany są już w rejestrze. Zostaną połączone, żeby saldo portfela nie policzyło ich dwa razy."
            : "Z wyciągu widać tylko wypłatę. Podaj, ile dostałeś w zamian — tego bank nie wie."}
        </p>
        <div className="rounded-xl border border-line px-4 py-3 text-sm [&_div]:flex [&_div]:justify-between [&_div]:gap-4 [&_div]:py-1">
          <div>
            <span className="text-muted">Wychodzi</span>
            <strong>{money(source.amount!, source.currency)}</strong>
          </div>
          <div>
            <span className="text-muted">Wchodzi</span>
            <strong>
              {amount > 0 && chosen
                ? money(amount, chosen.currency)
                : target
                  ? money(amount, target.currency)
                  : "—"}
            </strong>
          </div>
          <div className="border-t border-line">
            <span className="text-muted">Kurs</span>
            <strong>
              {rate > 0
                ? `${rateFormat.format(rate)} zł za 1 ${(chosen ?? target)?.currency ?? ""}`
                : "—"}
            </strong>
          </div>
        </div>
        {needsNewWallet && target && (
          <p className="flex items-center gap-3 rounded-xl px-4 py-3 text-sm leading-relaxed bg-accent-soft text-accent">
            Powstanie nowy portfel {target.currency} dla konta {target.account}.
          </p>
        )}
        {!target && (
          <>
            <label>
              Portfel
              <AppSelect
                ariaLabel="Portfel do zasilenia"
                value={walletId}
                onValueChange={setWalletId}
                options={[
                  { value: "", label: "Wybierz portfel" },
                  ...wallets.map((wallet) => ({
                    value: String(wallet.id),
                    label: `${wallet.currency} — ${wallet.account}`,
                  })),
                ]}
              />
              {!wallets.length && (
                <small>Najpierw załóż portfel na stronie Portfele.</small>
              )}
            </label>
            <label>
              Ile dostałeś {chosen ? `(${chosen.currency})` : ""}
              <input
                type="number"
                min="0.01"
                step="0.01"
                required
                value={received}
                onChange={(event) => setReceived(event.target.value)}
              />
            </label>
          </>
        )}
        <details>
          <summary>Prowizja</summary>
          <p className="text-sm leading-relaxed text-muted">
            Prowizja jest osobnym wydatkiem, nie wlicza się w kurs.
          </p>
          <label>
            Kwota ({source.currency})
            <input
              type="number"
              min="0"
              step="0.01"
              value={fee}
              onChange={(event) => setFee(event.target.value)}
            />
          </label>
          {Number(fee) > 0 && (
            <label>
              Kategoria prowizji
              <CategorySelect
                categories={categories}
                value={feeCategory}
                onChange={setFeeCategory}
              />
            </label>
          )}
        </details>
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
            disabled={action.busy || (!target && !chosen)}
          >
            {action.busy ? "Zapisuję…" : "Zasil portfel"}
          </button>
        </footer>
      </form>
    </Modal>
  );
}

export function SellWalletForm({
  selected,
  onClose,
  onSaved,
}: {
  selected: Block[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { data } = useResource<{ wallets: Wallet[] }>("/wallets");
  const wallets = (data?.wallets ?? []).filter(
    (wallet) => wallet.currency !== "PLN",
  );
  const proceeds = selected.find((row) => Number(row.amount) > 0)!;
  const source = selected.find((row) => Number(row.amount) < 0);
  const [walletId, setWalletId] = useState("");
  const [given, setGiven] = useState(source ? String(-Number(source.amount)) : "");
  const action = useAction(onSaved);
  const wallet = wallets.find((item) => String(item.id) === walletId);

  const amount = Number(given || 0);
  const received = Number(proceeds.amount ?? 0);
  const params = new URLSearchParams({
    proceeds_transaction_id: String(proceeds.id),
    given_amount: given,
  });
  if (source?.id) params.set("source_transaction_id", String(source.id));
  const quote = useResource<{ basis: string; difference: string }>(
    wallet && amount > 0 ? `/wallets/${wallet.id}/sale-preview?${params}` : null,
  );
  const valued = !quote.loading && !quote.error && wallet && amount > 0 && quote.data;
  const difference = valued ? Number(quote.data!.difference) : 0;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const ok = await action.run(() =>
      request(`/wallets/${walletId}/sell`, "POST", {
        proceeds_transaction_id: proceeds.id,
        given_amount: given,
        source_transaction_id: source?.id ?? null,
      }),
    );
    if (ok) onClose();
  }

  return (
    <Modal title="Odsprzedaj walutę" onClose={onClose} busy={action.busy}>
      <form
        onSubmit={submit}
        className="flex flex-col gap-5 p-5 sm:p-6 [&>p]:text-sm [&>p]:leading-relaxed [&_label]:flex [&_label]:flex-col [&_label]:gap-2 [&_label]:text-sm [&_label_small]:text-xs [&_label_small]:text-muted"
      >
        <Notice error={action.error || quote.error} />
        <p className="text-muted">
          Większość tej wpłaty to Twoje własne pieniądze wracające, więc nie jest
          przychodem. Przychodem jest tylko różnica między tym, co dostajesz, a
          tym, ile ta waluta Cię kosztowała.
        </p>
        <label>
          Z którego portfela
          <AppSelect
            ariaLabel="Portfel do odsprzedaży"
            value={walletId}
            onValueChange={setWalletId}
            options={[
              { value: "", label: "Wybierz portfel" },
              ...wallets.map((item) => ({
                value: String(item.id),
                label: `${item.currency} — ${item.account} · ${money(item.balance, item.currency)}`,
              })),
            ]}
          />
          {!wallets.length && <small>Najpierw utwórz portfel sprzedawanej waluty.</small>}
        </label>
        <label>
          Ile sprzedajesz {wallet ? `(${wallet.currency})` : ""}
          <input
            type="number"
            min="0.01"
            step="0.01"
            required
            value={given}
            onChange={(event) => setGiven(event.target.value)}
          />
        </label>
        <div className="rounded-xl border border-line px-4 py-3 text-sm [&_div]:flex [&_div]:justify-between [&_div]:gap-4 [&_div]:py-1">
          <div>
            <span className="text-muted">Kosztowało Cię</span>
            <strong>{valued ? money(quote.data!.basis, "PLN") : "—"}</strong>
          </div>
          <div>
            <span className="text-muted">Dostajesz</span>
            <strong>{money(received, proceeds.currency)}</strong>
          </div>
          <div className="border-t border-line">
            <span className="text-muted">
              {difference >= 0 ? "Zysk kursowy" : "Strata kursowa"}
            </span>
            <strong className={difference >= 0 ? "text-success" : "text-danger"}>
              {valued ? money(Math.abs(difference), "PLN") : "—"}
            </strong>
          </div>
        </div>
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
            disabled={action.busy || !valued}
          >
            {action.busy ? "Zapisuję…" : "Odsprzedaj"}
          </button>
        </footer>
      </form>
    </Modal>
  );
}
