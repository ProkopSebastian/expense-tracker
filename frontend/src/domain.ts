export interface Category {
  key: string;
  label: string;
  parent_key: string | null;
  kind: string;
  icon?: string | null;
  color?: string | null;
  is_custom?: boolean;
}
export interface Meta {
  categories: Category[];
  accounts: string[];
  ai_enabled: boolean;
}
export interface TransactionRow {
  bank_status?: string;
  pln_amount?: string | null;
  id: number;
  date: string;
  account: string;
  description: string;
  counterparty: string;
  amount: string;
  currency: string;
  category_key: string | null;
  category_label: string;
}
export interface Block extends Omit<TransactionRow, "id" | "amount"> {
  key: string;
  id: number | null;
  amount: string | null;
  real_amount: string;
  valuation_missing?: string | null;
  from_statement?: boolean;
  off_balance?: boolean;
  case_id: number | null;
  members: TransactionRow[];
}
export interface Relation {
  id: number;
  kind: string;
  payload: {
    title: string;
    kind: string;
    currency: string;
    personal_amount: number;
    rationale: string;
    transaction_ids: number[];
  };
  members: {
    id: number;
    date: string;
    description: string;
    amount: string;
    currency: string;
  }[];
}
export interface LedgerData {
  blocks: Block[];
  page: number;
  pages: number;
  page_size: number;
  total: number;
  currencies: string[];
  cases: {
    id: number;
    title: string;
    personal_amount: string;
    currency: string;
  }[];
}
export interface ClassificationRow {
  key: string;
  suggestion_id: number | null;
  transaction_id: number | null;
  description: string;
  date: string;
  counterparty: string;
  count: number;
  totals: Record<string, string>;
  members?: { date: string; amount: string; currency: string }[];
  category_key: string | null;
  rationale: string;
  confidence: number | null;
  remember: boolean;
}
export interface Wallet {
  id: number;
  account: string;
  currency: string;
  balance: string;
  average_cost: string | null;
  pln_value: string | null;
  uncovered: string;
  kind: "bank" | "cash";
  held_before: { amount: string; date: string; rate_known: boolean; pln: string | null } | null;
}
export interface WalletEvent {
  transaction_id: number;
  kind: "topup" | "spend" | "inflow" | "conversion_out" | "held_before";
  date: string;
  description: string;
  amount: string;
  pln: string | null;
  rate?: string | null;
  uncovered?: string;
  rate_known?: boolean;
}
export type AssetKind =
  | "account"
  | "savings"
  | "bonds"
  | "investments"
  | "cash"
  | "gold"
  | "debt"
  | "other";
export interface Asset {
  id: number;
  name: string;
  kind: AssetKind;
  currency: string;
  institution: string | null;
  is_active: boolean;
  latest: {
    day: string;
    amount: string;
    rate: string | null;
    pln: string;
  } | null;
}
export interface Snapshot {
  id: number;
  day: string;
  total: string;
  change: string | null;
  by_kind: Partial<Record<AssetKind, string>>;
  balances: { asset_id: number; amount: string; pln: string }[];
  rates: Record<string, string>;
}
export interface WealthData {
  assets: Asset[];
  snapshots: Snapshot[];
}
export interface Rule {
  created_at: string;
  id: number;
  name: string;
  category_key: string;
  category_label: string;
}
export type Page =
  | "data"
  | "summary"
  | "ledger"
  | "wealth"
  | "currencies"
  | "wallets"
  | "classification"
  | "rules";
export const pages: Record<Page, { title: string; description: string }> = {
  data: {
    title: "Import danych",
    description: "Dodawaj wyciągi i synchronizuj folder",
  },
  summary: {
    title: "Podsumowanie",
    description: "Wydatki i przychody w wybranym okresie.",
  },
  ledger: {
    title: "Historia transakcji",
    description: "Każda transakcja. Każda grupa. Pełny obraz.",
  },
  wealth: {
    title: "Majątek",
    description: "Ile masz na kontach, lokatach i w inwestycjach.",
  },
  currencies: {
    title: "Waluty",
    description: "Waluty na kontach, ile ich masz i po jakim kursie je kupiłeś.",
  },
  wallets: {
    title: "Portfele",
    description: "Gotówka, ile masz i na co poszła.",
  },
  classification: {
    title: "Do klasyfikacji",
    description: "Uporządkuj wydatki, po swojemu lub z pomocą AI.",
  },
  rules: {
    title: "Reguły sprzedawców",
    description: "Kategorie zapamiętane dla sprzedawców.",
  },
};
