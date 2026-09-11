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

export function monthShortLabel(month: string): string {
  return new Intl.DateTimeFormat("pl-PL", {
    month: "short",
    year: "2-digit",
  }).format(new Date(`${month}-01T12:00:00`));
}
