import { Banknote, Landmark } from "lucide-react";
import type { Wallet, WalletEvent } from "../domain";
import { useResource } from "../hooks";
import { money, rateFormat } from "../api";
import { Notice } from "./Forms";

export const WALLET_GRID_CLASS = "mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3";

export function rateLabel(value: string, currency: string) {
  return `${rateFormat.format(Number(value))} zł / 1 ${currency}`;
}

const EVENT_LABELS: Record<WalletEvent["kind"], string> = {
  topup: "Zasilenie",
  spend: "Wydatek",
  inflow: "Wpływ",
  conversion_out: "Wymiana na inną walutę",
  held_before: "Saldo początkowe",
};

export function WalletTile({
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
            : wallet.pln_value === null ? "Brak kursu" : `≈ ${money(wallet.pln_value, "PLN")}`}
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

export function WalletHistory({ wallet, revision }: { wallet: Wallet; revision: number }) {
  const { data, error, loading } = useResource<{ history: WalletEvent[] }>(
    `/wallets/${wallet.id}/history`,
    revision,
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
        <table className="w-full text-sm [&_td]:border-t [&_td]:border-line/40 [&_td]:py-2.5 [&_td]:pr-4 [&_td]:align-top [&_th]:pr-4 [&_th]:pb-2 [&_th]:text-left [&_th]:text-xs [&_th]:font-normal [&_th]:whitespace-nowrap [&_th]:text-muted [&_td:not(:nth-child(2))]:whitespace-nowrap">
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
                <td className="w-full">{event.description}</td>
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
                  {event.pln === null ? "Brak wyceny" : money(event.pln, "PLN")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
