export interface LedgerLink {
  account?: string;
  from?: string;
  to?: string;
  unvalued?: boolean;
}

// History keeps its filters in session storage, so a link only has to replace them before opening it.
export function openLedger({ account = "all", from = "", to = "", unvalued = false }: LedgerLink) {
  const filters: Record<string, unknown> = {
    "ledger.query": "",
    "ledger.direction": "all",
    "ledger.category": [],
    "ledger.currency": "all",
    "ledger.account": account,
    "ledger.from": from,
    "ledger.to": to,
    "ledger.unvalued": unvalued,
    "ledger.page": 1,
  };
  try {
    for (const [key, value] of Object.entries(filters)) sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* Without storage the link still opens History, only unfiltered. */
  }
  window.location.hash = "ledger";
}
