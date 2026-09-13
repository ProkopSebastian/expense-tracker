import { money, type Summary } from "../api";

export default function SummaryCards({ data }: { data: Summary }) {
  return (
    <section
      className="flex h-full flex-col justify-between gap-8"
      aria-label="Kwoty w wybranym okresie"
    >
      <div>
        <h2 className="text-xs font-medium tracking-wide text-muted uppercase">
          Wydatki w okresie
        </h2>
        <strong className="mt-3 block text-3xl font-semibold tracking-tight tabular-nums sm:text-4xl 2xl:text-5xl">
          {money(data.expenses, data.currency)}
        </strong>
      </div>
      <div className="grid grid-cols-2 gap-4 border-t border-line pt-5">
        <div>
          <div className="text-xs text-muted">Przychody</div>
          <strong className="mt-2 block text-lg font-medium tracking-tight tabular-nums sm:text-xl">
            {money(data.income, data.currency)}
          </strong>
        </div>
        <div className="border-l border-line pl-4">
          <div className="text-xs text-muted">Bilans</div>
          <strong className="mt-2 block text-lg font-medium tracking-tight tabular-nums sm:text-xl">
            {money(data.balance, data.currency)}
          </strong>
        </div>
      </div>
    </section>
  );
}
