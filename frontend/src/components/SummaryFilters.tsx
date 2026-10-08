import * as Popover from "@radix-ui/react-popover";
import AppSelect from "./AppSelect";
import type { Dispatch, SetStateAction } from "react";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Check,
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
  const currentMonth = filters.month ?? data?.start?.slice(0, 7) ?? data?.months[0] ?? "";
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
    <section
      className="flex flex-wrap items-center gap-2"
      aria-label="Filtry podsumowania"
    >
      {filters.mode === "month" && currentMonth ? (
        <div className="flex items-center gap-1">
          <button
            aria-label="Poprzedni miesiąc"
            className="grid size-9 place-items-center rounded-lg border border-line bg-surface transition hover:bg-accent-soft"
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
          <Popover.Root>
            <Popover.Trigger
              aria-label={`Wybierz miesiąc, obecnie ${monthLabel(currentMonth)}`}
              className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-line bg-surface px-3 text-sm font-medium text-ink transition hover:border-accent/40 hover:bg-accent-soft"
            >
              <CalendarDays size={16} className="text-accent" />
              {monthLabel(currentMonth)}
              <ChevronDown size={15} className="text-muted" />
            </Popover.Trigger>
            <Popover.Portal>
              <Popover.Content
                align="center"
                sideOffset={6}
                className="z-50 max-h-[min(22rem,65dvh)] w-60 overflow-y-auto rounded-xl border border-line bg-surface p-1.5 text-ink shadow-xl"
                aria-label="Wybierz miesiąc"
              >
                {data?.months.map((month) => (
                  <Popover.Close asChild key={month}>
                    <button
                      type="button"
                      aria-current={month === currentMonth ? "date" : undefined}
                      onClick={() =>
                        setFilters((previous) => ({ ...previous, month }))
                      }
                      className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition hover:bg-accent-soft hover:text-accent aria-[current=date]:bg-accent-soft aria-[current=date]:font-semibold aria-[current=date]:text-accent"
                    >
                      {monthLabel(month)}
                      {month === currentMonth && <Check size={15} />}
                    </button>
                  </Popover.Close>
                ))}
              </Popover.Content>
            </Popover.Portal>
          </Popover.Root>
          <button
            aria-label="Następny miesiąc"
            className="grid size-9 place-items-center rounded-lg border border-line bg-surface transition hover:bg-accent-soft"
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
      ) : filters.mode === "custom" ? (
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
        data?.start &&
        data.end && (
          <span className="flex items-center gap-2 px-1 text-sm text-muted">
            <CalendarDays size={16} />
            {dateLabel(data.start)} – {dateLabel(data.end)}
          </span>
        )
      )}
      <AppSelect
        ariaLabel="Okres"
        value={filters.mode}
        onValueChange={(mode) => changeMode(mode as PeriodMode)}
        options={periods.map(([mode, label]) => ({ value: mode, label }))}
      />
      <AppSelect
        ariaLabel="Waluta"
        value={data?.currency ?? "ALL"}
        onValueChange={(currency) =>
          setFilters((previous) => ({
            mode: previous.mode,
            currency,
            ...(previous.mode === "custom"
              ? { start: previous.start, end: previous.end }
              : {}),
          }))
        }
        options={[
          { value: "ALL", label: "Łącznie (zł)" },
          ...(data?.currencies.length ? data.currencies : ["PLN"]).map(
            (currency) => ({
              value: currency,
              label: currency,
              group: "Pojedyncza waluta",
            }),
          ),
        ]}
      />
    </section>
  );
}
