import { money, type Summary } from "../api";
export default function SummaryCards({ data }: { data: Summary }) {
  return (
    <section className="metrics" aria-label="Kwoty w wybranym okresie">
      <article className="metric primary">
        <div className="metric-label">Wydatki</div>
        <strong>{money(data.expenses, data.currency)}</strong>
        <span className="metric-caption">Twój rzeczywisty koszt</span>
        <div className="metric-decoration" />
      </article>
      <article className="metric">
        <div className="metric-label">Przychody</div>
        <strong>{money(data.income, data.currency)}</strong>
        <span className="metric-caption">Wpływy w wybranym okresie</span>
      </article>
      <article className="metric">
        <div className="metric-label">Bilans okresu</div>
        <strong>{money(data.balance, data.currency)}</strong>
        <span className="metric-caption">Przychody minus wydatki</span>
      </article>
    </section>
  );
}
