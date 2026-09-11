import { money, type Summary } from "../api";
import { ArrowDownLeft, ArrowUpRight, Scale } from "lucide-react";
export default function SummaryCards({ data }: { data: Summary }) {
  return (
    <section className="metrics" aria-label="Kwoty w wybranym okresie">
      <article className="metric expense-metric">
        <div className="metric-label">
          Wydatki{" "}
          <span className="metric-icon">
            <ArrowDownLeft size={16} />
          </span>
        </div>
        <strong>{money(data.expenses, data.currency)}</strong>
        <span className="metric-caption">Twój rzeczywisty koszt</span>
      </article>
      <article className="metric income-metric">
        <div className="metric-label">
          Przychody{" "}
          <span className="metric-icon">
            <ArrowUpRight size={16} />
          </span>
        </div>
        <strong>{money(data.income, data.currency)}</strong>
        <span className="metric-caption">Wpływy w wybranym okresie</span>
      </article>
      <article className="metric balance-metric">
        <div className="metric-label">
          Bilans okresu{" "}
          <span className="metric-icon">
            <Scale size={16} />
          </span>
        </div>
        <strong>{money(data.balance, data.currency)}</strong>
        <span className="metric-caption">Przychody minus wydatki</span>
      </article>
    </section>
  );
}
