import type { Asset, Snapshot } from "./domain";

export function snapshotAmounts(assets: Asset[], snapshot?: Snapshot, editing = false) {
  const included = new Set(assets.filter((asset) => editing || asset.is_active).map((asset) => asset.id));
  return Object.fromEntries(
    (snapshot?.balances ?? [])
      .filter((balance) => included.has(balance.asset_id))
      .map((balance) => [balance.asset_id, balance.amount.replace(".", ",")]),
  );
}

export function snapshotRate(day: string, currency: string, editing?: Snapshot) {
  return editing?.day === day ? (editing.rates[currency] ?? "").replace(".", ",") : "";
}

export function displayedBalance(asset: Asset, lastDay: string | undefined) {
  return !asset.is_active || asset.latest?.day === lastDay ? asset.latest : null;
}
