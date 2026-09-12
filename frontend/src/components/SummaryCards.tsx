import { money, type Summary } from "../api";
import { ArrowDownLeft, ArrowUpRight, Scale } from "lucide-react";
export default function SummaryCards({ data }: { data: Summary }) {
  return (
    <section
      className="mb-6 grid gap-4 sm:grid-cols-3"
      aria-label="Kwoty w wybranym okresie"
    >
      <article className="relative overflow-hidden rounded-2xl border border-line bg-surface p-5 shadow-sm lg:p-6 [&>strong]:block [&>strong]:text-2xl [&>strong]:font-semibold [&>strong]:tracking-tight [&>strong]:tabular-nums 2xl:[&>strong]:text-3xl border-t-4 border-t-violet-500">
        <div className="mb-4 flex items-center justify-between gap-2 text-sm text-muted">
          Wydatki{" "}
          <span className="grid size-9 place-items-center rounded-xl bg-accent-soft text-accent">
            <ArrowDownLeft size={16} />
          </span>
        </div>
        <strong>{money(data.expenses, data.currency)}</strong>
        <span className="mt-3 block text-xs text-muted">
          Twój rzeczywisty koszt
        </span>
      </article>
      <article className="relative overflow-hidden rounded-2xl border border-line bg-surface p-5 shadow-sm lg:p-6 [&>strong]:block [&>strong]:text-2xl [&>strong]:font-semibold [&>strong]:tracking-tight [&>strong]:tabular-nums 2xl:[&>strong]:text-3xl border-t-4 border-t-sky-400">
        <div className="mb-4 flex items-center justify-between gap-2 text-sm text-muted">
          Przychody{" "}
          <span className="grid size-9 place-items-center rounded-xl bg-accent-soft text-accent">
            <ArrowUpRight size={16} />
          </span>
        </div>
        <strong>{money(data.income, data.currency)}</strong>
        <span className="mt-3 block text-xs text-muted">
          Wpływy w wybranym okresie
        </span>
      </article>
      <article className="relative overflow-hidden rounded-2xl border border-line bg-surface p-5 shadow-sm lg:p-6 [&>strong]:block [&>strong]:text-2xl [&>strong]:font-semibold [&>strong]:tracking-tight [&>strong]:tabular-nums 2xl:[&>strong]:text-3xl border-t-4 border-t-indigo-400">
        <div className="mb-4 flex items-center justify-between gap-2 text-sm text-muted">
          Bilans okresu{" "}
          <span className="grid size-9 place-items-center rounded-xl bg-accent-soft text-accent">
            <Scale size={16} />
          </span>
        </div>
        <strong>{money(data.balance, data.currency)}</strong>
        <span className="mt-3 block text-xs text-muted">
          Przychody minus wydatki
        </span>
      </article>
    </section>
  );
}
