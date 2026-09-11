export interface Category {
  key: string;
  label: string;
  parent_key: string | null;
  kind: string;
}
export interface Meta {
  categories: Category[];
  ai_enabled: boolean;
}
export interface TransactionRow {
  bank_status?: string;
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
}
export interface LedgerData {
  blocks: Block[];
  page: number;
  pages: number;
  total: number;
  cases: {
    id: number;
    title: string;
    personal_amount: string;
    currency: string;
  }[];
  relations: Relation[];
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
  category_key: string | null;
  rationale: string;
  confidence: number | null;
  remember: boolean;
}
export interface Rule {
  created_at: string;
  id: number;
  name: string;
  category_key: string;
  category_label: string;
}
export type Page = "data" | "summary" | "ledger" | "classification" | "rules";
export const pages: Record<Page, { title: string; description: string }> = {
  data: { title: "Dane i ustawienia", description: "Import i kopie zapasowe" },
  summary: {
    title: "Podsumowanie",
    description: "Wydatki i przychody w wybranym okresie.",
  },
  ledger: {
    title: "Historia transakcji",
    description: "Każda transakcja. Każda grupa. Pełny obraz.",
  },
  classification: {
    title: "Do klasyfikacji",
    description: "Uporządkuj wydatki, po swojemu lub z pomocą AI.",
  },
  rules: {
    title: "Reguły sprzedawców",
    description: "Jedna decyzja teraz. Mniej pracy przy kolejnych wydatkach.",
  },
};
