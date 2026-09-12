import * as Tabs from "@radix-ui/react-tabs";
import type { Dispatch, SetStateAction } from "react";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
} from "lucide-react";
import {
  monthLabel,
  type Filters,
  type PeriodMode,
  type Summary,
} from "../api";
const periods: [PeriodMode, string][] = [
  ["month", "Miesiąc"],
  ["30days", "30 dni"],
  ["3months", "3 miesiące"],
  ["year", "Rok"],
  ["custom", "Własny zakres"],
];
const dateLabel = (value: string) =>
  new Intl.DateTimeFormat("pl-PL", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(`${value}T12:00:00`));

interface Props {
  filters: Filters;
  data: Summary | null;
  loading: boolean;
  setFilters: Dispatch<SetStateAction<Filters>>;
}
export default function SummaryFilters({
  filters,
  data,
  loading,
  setFilters,
}: Props) {
  const currentMonth = filters.month ?? data?.months[0] ?? "";
  const monthIndex = data?.months.indexOf(currentMonth) ?? -1;
  const changeMode = (mode: PeriodMode) =>
    setFilters((previous) => ({
      currency: previous.currency,
      mode,
      ...(mode === "custom"
        ? { start: data?.start ?? undefined, end: data?.end ?? undefined }
        : {}),
    }));

  return (
    <Tabs.Root
      value={filters.mode}
      onValueChange={(value) => changeMode(value as PeriodMode)}
    >
      <section
        className="flex flex-wrap items-center justify-between gap-4 border-b border-line pb-4"
        aria-label="Filtry podsumowania"
      >
        <Tabs.List
          className="flex flex-wrap gap-1 rounded-xl bg-surface-muted p-1 [&_button]:rounded-lg [&_button]:px-3 [&_button]:py-2 [&_button]:text-sm [&_button]:whitespace-nowrap [&_button]:text-muted [&_button[data-state=active]]:bg-surface [&_button[data-state=active]]:text-accent [&_button[data-state=active]]:shadow-sm"
          aria-label="Okres"
        >
          {periods.map(([mode, label]) => (
            <Tabs.Trigger key={mode} value={mode}>
              {label}
            </Tabs.Trigger>
          ))}
        </Tabs.List>
        <div className="flex items-center gap-3 text-sm text-muted">
          <label htmlFor="currency">Waluta</label>
          <select
            id="currency"
            value={data?.currency ?? "PLN"}
            onChange={(event) =>
              setFilters((previous) => ({
                mode: previous.mode,
                currency: event.target.value,
                ...(previous.mode === "custom"
                  ? { start: previous.start, end: previous.end }
                  : {}),
              }))
            }
          >
            {(data?.currencies.length ? data.currencies : ["PLN"]).map(
              (currency) => (
                <option key={currency}>{currency}</option>
              ),
            )}
          </select>
        </div>
      </section>
      <Tabs.Content
        value={filters.mode}
        className="flex min-h-20 flex-wrap items-center justify-between gap-3 py-3"
      >
        {filters.mode === "month" && currentMonth ? (
          <div className="flex items-center gap-2 [&>button]:grid [&>button]:size-8 [&>button]:place-items-center [&>button]:rounded-lg [&>button]:border [&>button]:border-line [&>button]:bg-surface [&_label]:relative [&_label]:flex [&_label]:items-center [&_label]:gap-2 [&_label>svg:last-child]:pointer-events-none [&_label>svg:last-child]:absolute [&_label>svg:last-child]:right-1 [&_select]:appearance-none [&_select]:border-0 [&_select]:bg-transparent [&_select]:pr-7 [&_select]:font-medium">
            <button
              aria-label="Poprzedni miesiąc"
              disabled={
                !data ||
                monthIndex < 0 ||
                monthIndex >= data.months.length - 1 ||
                loading
              }
              onClick={() =>
                setFilters((previous) => ({
                  ...previous,
                  month: data!.months[monthIndex + 1],
                }))
              }
            >
              <ChevronLeft size={17} />
            </button>
            <label>
              <CalendarDays size={17} />
              <select
                aria-label="Miesiąc"
                value={currentMonth}
                onChange={(event) =>
                  setFilters((previous) => ({
                    ...previous,
                    month: event.target.value,
                  }))
                }
              >
                {data?.months.map((month) => (
                  <option key={month} value={month}>
                    {monthLabel(month)}
                  </option>
                ))}
              </select>
              <ChevronDown size={14} />
            </label>
            <button
              aria-label="Następny miesiąc"
              disabled={monthIndex <= 0 || loading}
              onClick={() =>
                setFilters((previous) => ({
                  ...previous,
                  month: data!.months[monthIndex - 1],
                }))
              }
            >
              <ChevronRight size={17} />
            </button>
          </div>
        ) : (
          <span className="flex items-center gap-2 text-xs text-muted">
            <CalendarDays size={16} />
            {filters.mode === "custom"
              ? "Wybierz zakres dat"
              : "Okres do ostatniej dostępnej transakcji"}
          </span>
        )}
        {filters.mode === "custom" ? (
          <div className="flex min-w-0 items-center gap-2 text-sm [&_input]:min-w-0 [&_input]:w-full">
            <input
              type="date"
              aria-label="Data początkowa"
              value={filters.start ?? ""}
              max={filters.end ?? undefined}
              onChange={(event) =>
                setFilters((previous) => ({
                  ...previous,
                  start: event.target.value,
                }))
              }
            />
            <span>—</span>
            <input
              type="date"
              aria-label="Data końcowa"
              value={filters.end ?? ""}
              min={filters.start ?? undefined}
              onChange={(event) =>
                setFilters((previous) => ({
                  ...previous,
                  end: event.target.value,
                }))
              }
            />
          </div>
        ) : (
          <span className="flex items-center gap-2 text-xs text-muted">
            {data?.start && data.end
              ? `${dateLabel(data.start)} – ${dateLabel(data.end)}`
              : ""}
          </span>
        )}
      </Tabs.Content>
    </Tabs.Root>
  );
}
