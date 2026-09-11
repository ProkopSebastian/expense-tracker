import { useEffect, useState } from "react";
import { CircleHelp, RefreshCw, LockKeyhole } from "lucide-react";
import { fetchSummary, type Filters, type Summary } from "../api";
import SummaryFilters from "../components/SummaryFilters";
import SummaryCards from "../components/SummaryCards";
import BreakdownPanel from "../components/BreakdownPanel";

export default function SummaryPage({
  externalRevision,
}: {
  externalRevision: number;
}) {
  const [filters, setFilters] = useState<Filters>({ mode: "month" });
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
        setData(result);
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
      <div className="page-heading">
        <div>
          <h1>Podsumowanie</h1>
          <p>Wydatki i przychody w wybranym okresie.</p>
        </div>
        <button
          className="button refresh"
          onClick={() => setRevision((value) => value + 1)}
          disabled={loading}
        >
          <RefreshCw size={16} className={loading ? "spin" : ""} />
          Odśwież widok
        </button>
      </div>

      <SummaryFilters
        filters={filters}
        data={data}
        loading={loading}
        setFilters={setFilters}
      />

      {error ? (
        <div role="alert" className="empty-state">
          <CircleHelp />
          <h2>Nie udało się pobrać danych</h2>
          <p>{error}</p>
          <button
            className="button"
            onClick={() => setRevision((value) => value + 1)}
          >
            Spróbuj ponownie
          </button>
        </div>
      ) : !data ? (
        <div role="status" className="empty-state">
          Wczytuję podsumowanie…
        </div>
      ) : (
        <div
          className={loading ? "results loading" : "results"}
          aria-busy={loading}
        >
          <SummaryCards data={data} />
          <BreakdownPanel
            key={`${data.start}:${data.end}:${data.currency}:${revision}:${externalRevision}`}
            data={data}
          />
          <div className="bottom-note">
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
