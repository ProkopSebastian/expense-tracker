import { useSessionState } from "../hooks";
import BalanceTimeline from "../components/BalanceTimeline";
import { useEffect, useState } from "react";
import { CircleHelp } from "lucide-react";
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
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <h1>Podsumowanie</h1>
        <SummaryFilters
          filters={filters}
          data={data}
          loading={loading}
          setFilters={setFilters}
        />
      </div>

      {error ? (
        <div
          role="alert"
          className="flex min-h-48 flex-col items-center justify-center gap-4 p-6 text-center text-sm text-muted"
        >
          <CircleHelp />
          <h2>Nie udało się pobrać danych</h2>
          <p>{error}</p>
          <button
            className="btn"
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
          {data.untranslated.length > 0 && (
            <p
              role="status"
              className="mb-5 flex items-center gap-3 rounded-xl bg-danger/10 px-4 py-3 text-sm leading-relaxed text-danger"
            >
              <CircleHelp size={17} className="shrink-0" />
              Podsumowanie jest niepełne: część operacji w {data.untranslated.join(", ")}
              {" "}nie ma znanego kosztu w złotówkach. Uzupełnij wcześniejsze
              zasilenia portfela albo saldo otwarcia.
            </p>
          )}
          <div className="mb-6 grid gap-6 lg:grid-cols-[minmax(0,0.65fr)_minmax(0,1.35fr)]">
            <div className="card">
              <SummaryCards data={data} />
            </div>
            <div className="card p-6">
              <BalanceTimeline data={data} />
            </div>
          </div>
          <div className="card p-6">
            <BreakdownPanel
              key={`${data.start}:${data.end}:${data.currency}:${revision}:${externalRevision}`}
              data={data}
            />
          </div>
        </div>
      )}
    </>
  );
}
