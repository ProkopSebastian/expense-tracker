import { useEffect, useState, useRef, useLayoutEffect } from "react";
import { ChevronRight, Undo2 } from "lucide-react";
import { pages, type Page, type Meta } from "./domain";
import { request, useResource, useAction } from "./hooks";
import DataPage from "./pages/DataPage";
import Sidebar from "./components/Sidebar";
import { Notice } from "./components/Forms";
import SummaryPage from "./pages/SummaryPage";
import LedgerPage from "./pages/LedgerPage";
import ClassificationPage from "./pages/ClassificationPage";
import RulesPage from "./pages/RulesPage";
function currentPage(): Page {
  const key = window.location.hash.slice(1);
  return Object.hasOwn(pages, key) ? (key as Page) : "summary";
}
export default function App() {
  const [page, setPage] = useState<Page>(currentPage),
    [revision, setRevision] = useState(0);
  const positions = useRef<Partial<Record<Page, number>>>({});
  const previousPage = useRef(page);
  useLayoutEffect(() => {
    window.scrollTo(0, positions.current[page] ?? 0);
  }, [page]);
  const { data: meta, error } = useResource<Meta>("/meta", revision);
  const changed = () => setRevision((value) => value + 1);
  const action = useAction(changed);
  const { data: recovery } = useResource<{
    can_undo: boolean;
    label: string | null;
  }>("/recovery", revision);
  const [undoNoticeVisible, setUndoNoticeVisible] = useState(false);
  useEffect(() => {
    if (revision === 0) return;
    setUndoNoticeVisible(true);
    const timer = setTimeout(() => setUndoNoticeVisible(false), 8000);
    return () => clearTimeout(timer);
  }, [revision]);
  useEffect(() => {
    const handler = () => {
      positions.current[previousPage.current] = window.scrollY;
      previousPage.current = currentPage();
      setPage(previousPage.current);
    };
    window.addEventListener("hashchange", handler);
    return () => window.removeEventListener("hashchange", handler);
  }, []);
  useEffect(() => {
    document.title = `Wydatki · ${pages[page].title}`;
  }, [page]);
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
        </header>
        <div className="main-content">
          <Notice error={error || action.error} notice={action.notice} />
          {undoNoticeVisible && recovery?.can_undo && (
            <div className="undo-notice" role="status">
              <span>{recovery.label ?? "Zmiany zapisane"} · zapisano</span>
              <button
                className="button"
                disabled={action.busy}
                onClick={() =>
                  action.run(
                    () => request("/undo", "POST"),
                    "Ostatnia zmiana została cofnięta.",
                  )
                }
              >
                <Undo2 size={14} /> Cofnij
              </button>
              <button
                className="icon-button"
                aria-label="Zamknij powiadomienie"
                onClick={() => setUndoNoticeVisible(false)}
              >
                ×
              </button>
            </div>
          )}
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
          ) : page === "data" ? (
            <DataPage
              accounts={Array.isArray(meta.accounts) ? meta.accounts : []}
              aiEnabled={meta.ai_enabled}
              revision={revision}
              onChanged={changed}
            />
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
