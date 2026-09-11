export type PeriodMode = "month" | "30days" | "3months" | "year" | "custom";
export interface BreakdownNode {
  key: string;
  label: string;
  total: string;
  children: BreakdownNode[];
}
export interface Summary {
  currency: string;
  currencies: string[];
  months: string[];
  start: string | null;
  end: string | null;
  first_date: string | null;
  last_date: string | null;
  expenses: string;
  income: string;
  balance: string;
  item_count: number;
  breakdown: BreakdownNode[];
}
export interface Filters {
  mode: PeriodMode;
  currency?: string;
  month?: string;
  start?: string;
  end?: string;
}

export async function fetchSummary(
  filters: Filters,
  signal: AbortSignal,
): Promise<Summary> {
  const query = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value) query.set(key, value);
  });
  const response = await fetch(`/api/summary?${query}`, { signal });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(
      typeof body?.detail === "string"
        ? body.detail
        : "Nie udało się wczytać podsumowania.",
    );
  }
  return response.json();
}

export function money(value: string | number, currency: string): string {
  return new Intl.NumberFormat("pl-PL", { style: "currency", currency }).format(
    Number(value),
  );
}

export function monthLabel(month: string): string {
  return new Intl.DateTimeFormat("pl-PL", {
    month: "long",
    year: "numeric",
  }).format(new Date(`${month}-01T12:00:00`));
}
