import { useEffect, useState } from "react";
import { ChevronRight, RefreshCw } from "lucide-react";
import { pages, type Page, type Meta } from "./domain";
import { request, useResource, useAction } from "./hooks";
import Sidebar from "./components/Sidebar";
import { Notice } from "./components/Forms";
import SummaryPage from "./pages/SummaryPage";
import LedgerPage from "./pages/LedgerPage";
import ClassificationPage from "./pages/ClassificationPage";
import RulesPage from "./pages/RulesPage";
function currentPage(): Page {
  const key = window.location.hash.slice(1);
  return key in pages ? (key as Page) : "summary";
}
interface SyncResult {
  transactions_inserted: number;
  new_files: string[];
  unsupported_files: string[];
  error_files: [string, string][];
}
export default function App() {
  const [page, setPage] = useState<Page>(currentPage),
    [revision, setRevision] = useState(0),
    [syncNotice, setSyncNotice] = useState("");
  const { data: meta, error } = useResource<Meta>("/meta", revision);
  const changed = () => setRevision((value) => value + 1);
  const action = useAction(changed);
  useEffect(() => {
    const handler = () => {
      setPage(currentPage());
      window.scrollTo(0, 0);
    };
    window.addEventListener("hashchange", handler);
    return () => window.removeEventListener("hashchange", handler);
  }, []);
  useEffect(() => {
    document.title = `Wydatki · ${pages[page].title}`;
  }, [page]);
  async function sync() {
    setSyncNotice("");
    await action.run(async () => {
      const result = await request<SyncResult>("/sync", "POST");
      setSyncNotice(
        [
          result.new_files.length
            ? `Dodano ${result.transactions_inserted} transakcji z ${result.new_files.length} plików.`
            : "Dane są aktualne.",
          ...result.unsupported_files.map(
            (f) => `Nie rozpoznano formatu: ${f}.`,
          ),
          ...result.error_files.map(([f, e]) => `${f}: ${e}`),
        ].join(" "),
      );
    }, "");
  }
  return (
    <div className="app-shell">
      <Sidebar page={page} />
      <main>
        <header className="topbar">
          <span>
            Twoje finanse
            <ChevronRight size={14} />
            <strong>{pages[page].title}</strong>
          </span>
          <button className="button" onClick={sync} disabled={action.busy}>
            <RefreshCw size={15} className={action.busy ? "spin" : ""} />
            {action.busy ? "Importuję…" : "Odśwież dane"}
          </button>
        </header>
        <div className="main-content">
          <Notice error={error || action.error} notice={syncNotice} />
          {!meta ? (
            <div className="empty-state">
              {error ? (
                <button className="button" onClick={changed}>
                  Spróbuj ponownie
                </button>
              ) : (
                "Wczytuję aplikację…"
              )}
            </div>
          ) : page === "summary" ? (
            <SummaryPage externalRevision={revision} />
          ) : page === "ledger" ? (
            <LedgerPage
              categories={meta.categories}
              revision={revision}
              onChanged={changed}
            />
          ) : page === "classification" ? (
            <ClassificationPage
              categories={meta.categories}
              aiEnabled={meta.ai_enabled}
              revision={revision}
              onChanged={changed}
            />
          ) : (
            <RulesPage
              categories={meta.categories}
              revision={revision}
              onChanged={changed}
            />
          )}
        </div>
      </main>
    </div>
  );
}
