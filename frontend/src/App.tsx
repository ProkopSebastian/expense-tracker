import { useEffect, useState } from "react";
import { ChevronRight, CircleHelp, RefreshCw, LockKeyhole } from "lucide-react";
import { fetchSummary, type Filters, type Summary } from "./api";
import Sidebar from "./components/Sidebar";
import SummaryFilters from "./components/SummaryFilters";
import SummaryCards from "./components/SummaryCards";
import BreakdownPanel from "./components/BreakdownPanel";

export default function App() {
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
  }, [filters, revision]);

  return (
    <div className="app-shell">
      <Sidebar />

      <main>
        <header className="topbar">
          <span>
            Twoje finanse <ChevronRight size={14} />{" "}
            <strong>Podsumowanie</strong>
          </span>
          <span className="preview-badge">Podgląd nowego interfejsu</span>
        </header>
        <div className="main-content">
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
                key={`${data.start}:${data.end}:${data.currency}:${revision}`}
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
          <div className="preview-note">
            <span>
              Pierwszy etap: podsumowanie. Pozostałe sekcje są dostępne w
              dotychczasowej aplikacji.
            </span>
          </div>
        </div>
      </main>
    </div>
  );
}
