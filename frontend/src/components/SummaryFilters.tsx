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
    <>
      <section className="filterbar" aria-label="Filtry podsumowania">
        <div className="period-tabs" aria-label="Okres">
          {periods.map(([mode, label]) => (
            <button
              key={mode}
              aria-pressed={filters.mode === mode}
              className={filters.mode === mode ? "selected" : ""}
              onClick={() => changeMode(mode)}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="currency-control">
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
      <div className="date-row">
        {filters.mode === "month" && currentMonth ? (
          <div className="month-picker">
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
          <span className="date-caption">
            <CalendarDays size={16} />
            {filters.mode === "custom"
              ? "Wybierz zakres dat"
              : "Okres do ostatniej dostępnej transakcji"}
          </span>
        )}
        {filters.mode === "custom" ? (
          <div className="custom-dates">
            <input
              type="date"
              aria-label="Data początkowa"
              value={filters.start ?? ""}
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
              onChange={(event) =>
                setFilters((previous) => ({
                  ...previous,
                  end: event.target.value,
                }))
              }
            />
          </div>
        ) : (
          <span className="date-caption">
            {data?.start && data.end
              ? `${dateLabel(data.start)} – ${dateLabel(data.end)}`
              : ""}
          </span>
        )}
      </div>
    </>
  );
}
