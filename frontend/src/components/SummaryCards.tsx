import { money, type Summary } from "../api";

export default function SummaryCards({ data }: { data: Summary }) {
  return (
    <section
      className="mb-6 grid gap-4 sm:grid-cols-3"
      aria-label="Kwoty w wybranym okresie"
    >
      <article className="cursor-default rounded-2xl border border-line bg-surface p-5 lg:p-6 [&>strong]:block [&>strong]:text-2xl [&>strong]:font-semibold [&>strong]:tracking-tight [&>strong]:tabular-nums 2xl:[&>strong]:text-3xl">
        <div className="mb-4 text-sm text-muted">Wydatki</div>
        <strong>{money(data.expenses, data.currency)}</strong>
        <span className="mt-3 block text-xs text-muted">
          Twój rzeczywisty koszt
        </span>
      </article>
      <article className="cursor-default rounded-2xl border border-line bg-surface p-5 lg:p-6 [&>strong]:block [&>strong]:text-2xl [&>strong]:font-semibold [&>strong]:tracking-tight [&>strong]:tabular-nums 2xl:[&>strong]:text-3xl">
        <div className="mb-4 text-sm text-muted">Przychody</div>
        <strong>{money(data.income, data.currency)}</strong>
        <span className="mt-3 block text-xs text-muted">
          Wpływy w wybranym okresie
        </span>
      </article>
      <article className="cursor-default rounded-2xl border border-line bg-surface p-5 lg:p-6 [&>strong]:block [&>strong]:text-2xl [&>strong]:font-semibold [&>strong]:tracking-tight [&>strong]:tabular-nums 2xl:[&>strong]:text-3xl">
        <div className="mb-4 text-sm text-muted">Bilans okresu</div>
        <strong>{money(data.balance, data.currency)}</strong>
        <span className="mt-3 block text-xs text-muted">
          Przychody minus wydatki
        </span>
      </article>
    </section>
  );
}
