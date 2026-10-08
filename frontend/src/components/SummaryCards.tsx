import * as Popover from "@radix-ui/react-popover";
import { money, type Summary } from "../api";

function MissingRate({ codes }: { codes: string[] }) {
  return (
    <Popover.Root>
      <Popover.Trigger
        aria-label="Suma niepełna"
        className="ml-0.5 align-super text-2xl text-warning hover:text-accent"
      >
        *
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={6}
          className="z-50 w-72 rounded-xl border border-line bg-surface p-4 text-sm leading-relaxed text-muted shadow-xl"
        >
          Bez wydatków w {codes.join(", ")}, dla których brakuje kursu. Uzupełnisz go w zakładce
          Waluty albo Gotówka.
          <Popover.Arrow className="fill-surface" />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

export default function SummaryCards({ data }: { data: Summary }) {
  const balance = Number(data.balance);
  return (
    <section
      className="grid h-full grid-rows-[1.4fr_1fr_1fr] divide-y divide-line/60 [&>div]:flex [&>div]:px-6"
      aria-label="Kwoty w wybranym okresie"
    >
      <div className="flex-col justify-center py-5">
        <h2 className="text-sm font-normal tracking-normal text-muted">
          Wydatki w okresie
        </h2>
        <strong className="mt-1 block text-4xl font-semibold tracking-tight tabular-nums">
          {money(data.expenses, data.currency)}
          {data.untranslated.length > 0 && <MissingRate codes={data.untranslated} />}
        </strong>
      </div>
      <div className="items-center justify-between gap-4 py-4">
        <span className="text-sm text-muted">Przychody</span>
        <strong className="text-xl font-semibold tracking-tight tabular-nums">
          {money(data.income, data.currency)}
        </strong>
      </div>
      <div className="items-center justify-between gap-4 py-4">
        <span className="text-sm text-muted">Bilans</span>
        <strong
          className={`text-xl font-semibold tracking-tight tabular-nums ${balance > 0 ? "text-success" : balance < 0 ? "text-danger" : ""}`}
        >
          {balance > 0 ? "+" : ""}
          {money(data.balance, data.currency)}
        </strong>
      </div>
    </section>
  );
}
