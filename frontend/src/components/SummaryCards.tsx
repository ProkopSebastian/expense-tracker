import { money, type Summary } from "../api";

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
