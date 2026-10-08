export type PeriodMode = "month" | "30days" | "3months" | "year" | "custom";
import type { SummaryResponse } from "./generated/summary";
export type { BreakdownNode } from "./generated/summary";
export type Summary = SummaryResponse;
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
  const response = await fetch(`/api/summary?${query}`, { signal }).catch((error) => {
    if (signal?.aborted) throw error;
    throw new Error("Brak połączenia z aplikacją. Spróbuj ponownie za chwilę.");
  });
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
  // "ALL" is the aggregate view's pseudo-code and its totals are already in złoty.
  if (currency === "ALL") currency = "PLN";
  if (!/^[A-Z]{3}$/.test(currency)) {
    // Never relabel an unknown code as złoty; show the number with the code as stored.
    const amount = new Intl.NumberFormat("pl-PL", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return `${amount.format(Number(value))} ${currency}`;
  }
  return new Intl.NumberFormat("pl-PL", { style: "currency", currency }).format(Number(value));
}

// A rate rounded to grosze is useless: 0,40 and 0,401849 differ by złoty over a few hundred
// dirhams. Money stays at two places; the rate gets four.
export const rateFormat = new Intl.NumberFormat("pl-PL", {
  minimumFractionDigits: 4,
  maximumFractionDigits: 4,
});

export function dayLabel(day: string): string {
  return day.split("-").reverse().join(".");
}

export function monthLabel(month: string): string {
  return new Intl.DateTimeFormat("pl-PL", {
    month: "long",
    year: "numeric",
  }).format(new Date(`${month}-01T12:00:00`));
}

export function monthShortLabel(month: string): string {
  return new Intl.DateTimeFormat("pl-PL", {
    month: "short",
    year: "2-digit",
  }).format(new Date(`${month}-01T12:00:00`));
}
