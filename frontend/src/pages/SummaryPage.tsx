import { useSessionState } from "../hooks";
import BalanceChart from "../components/BalanceChart";
import MonthlyBarChart from "../components/MonthlyBarChart";
import { useEffect, useState } from "react";
import { CircleHelp, LockKeyhole } from "lucide-react";
import { fetchSummary, type Filters, type Summary } from "../api";
import SummaryFilters from "../components/SummaryFilters";
import SummaryCards from "../components/SummaryCards";
import BreakdownPanel from "../components/BreakdownPanel";

export default function SummaryPage({
  externalRevision,
}: {
  externalRevision: number;
}) {
  const [filters, setFilters] = useSessionState<Filters>("summary.filters", {
    mode: "month",
  });
  const [data, setData] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    fetchSummary(filters, controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) setData(result);
      })
      .catch((cause) => {
        if (!controller.signal.aborted)
          setError(
            cause instanceof Error
              ? cause.message
              : "Brak połączenia z aplikacją.",
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [filters, revision, externalRevision]);

  return (
    <>
      <div className="mb-7 flex flex-wrap items-center justify-between gap-4 [&_p]:mt-2 [&_p]:text-sm [&_p]:leading-relaxed [&_p]:text-muted">
        <div>
          <h1>Podsumowanie</h1>
          <p>Wydatki i przychody w wybranym okresie.</p>
        </div>
      </div>

      <SummaryFilters
        filters={filters}
        data={data}
        loading={loading}
        setFilters={setFilters}
      />

      {error ? (
        <div
          role="alert"
          className="flex min-h-48 flex-col items-center justify-center gap-4 p-6 text-center text-sm text-muted"
        >
          <CircleHelp />
          <h2>Nie udało się pobrać danych</h2>
          <p>{error}</p>
          <button
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-line bg-surface px-4 py-2.5 text-sm font-medium shadow-sm transition hover:border-accent/30 hover:bg-accent-soft"
            onClick={() => setRevision((value) => value + 1)}
          >
            Spróbuj ponownie
          </button>
        </div>
      ) : !data ? (
        <div
          role="status"
          className="flex min-h-48 flex-col items-center justify-center gap-4 p-6 text-center text-sm text-muted"
        >
          Wczytuję podsumowanie…
        </div>
      ) : (
        <div
          className={
            loading
              ? "transition-opacity motion-reduce:transition-none opacity-60"
              : "transition-opacity motion-reduce:transition-none"
          }
          aria-busy={loading}
        >
          <div className="mb-8 grid gap-8 border-y border-line py-7 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] lg:gap-0">
            <SummaryCards data={data} />
            <BalanceChart data={data} />
          </div>
          <BreakdownPanel
            key={`${data.start}:${data.end}:${data.currency}:${revision}:${externalRevision}`}
            data={data}
          />
          <div className="mt-8">
            <MonthlyBarChart data={data} />
          </div>
          <div className="mt-6 flex flex-wrap justify-between gap-3 text-xs text-muted [&>span]:flex [&>span]:items-center [&>span]:gap-2">
            <span>
              <LockKeyhole size={14} />
              Dane z lokalnej bazy · waluty liczone osobno
            </span>
            <span>{data.item_count} pozycji w okresie</span>
          </div>
        </div>
      )}
    </>
  );
}
