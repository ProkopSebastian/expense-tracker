import * as Toast from "@radix-ui/react-toast";
import { useEffect, useState, useRef, useLayoutEffect } from "react";
import { ChevronRight, Undo2 } from "lucide-react";
import { pages, type Page, type Meta } from "./domain";
import { request, useResource, useAction } from "./hooks";
import DataPage from "./pages/DataPage";
import Sidebar from "./components/Sidebar";
import ThemeToggle from "./components/ThemeToggle";
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
    [revision, setRevision] = useState(0),
    [appNotice, setAppNotice] = useState("");
  const positions = useRef<Partial<Record<Page, number>>>({});
  const previousPage = useRef(page);
  useLayoutEffect(() => {
    window.scrollTo(0, positions.current[page] ?? 0);
  }, [page]);
  const { data: meta, error } = useResource<Meta>("/meta", revision);
  const changed = () => {
    setAppNotice("");
    setRevision((value) => value + 1);
  };
  const action = useAction(changed);
  const { data: recovery } = useResource<{
    can_undo: boolean;
    label: string | null;
  }>("/recovery", revision);
  const [undoNoticeVisible, setUndoNoticeVisible] = useState(false);
  useEffect(() => {
    if (revision === 0) return;
    setUndoNoticeVisible(true);
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
    <Toast.Provider duration={8000}>
      <div className="min-h-screen bg-canvas font-sans text-ink md:grid md:grid-cols-[84px_minmax(0,1fr)] xl:grid-cols-[248px_minmax(0,1fr)] [&_main]:min-w-0">
        <Sidebar
          page={page}
          aiEnabled={Boolean(meta?.ai_enabled)}
          onDataReset={(apiKeyPreserved) => {
            setAppNotice(
              apiKeyPreserved
                ? "Dane finansowe zostały usunięte. Klucz API został zachowany."
                : "Dane finansowe zostały usunięte.",
            );
            window.location.hash = "summary";
            setRevision((value) => value + 1);
          }}
        />
        <main>
          <header className="flex h-16 items-center justify-between gap-3 border-b border-line bg-surface/60 px-5 text-xs text-muted backdrop-blur md:px-8 lg:px-10 [&>span]:flex [&>span]:items-center [&>span]:gap-3 [&_strong]:font-medium [&_strong]:text-ink">
            <span>
              Twoje finanse
              <ChevronRight size={14} />
              <strong>{pages[page].title}</strong>
            </span>
            <ThemeToggle />
          </header>
          <div className="mx-auto max-w-[1600px] px-4 py-7 sm:px-6 lg:px-10 lg:py-9">
            <Notice
              error={error || action.error}
              notice={appNotice || action.notice}
            />
            {recovery?.can_undo && (
              <Toast.Root
                key={revision}
                open={undoNoticeVisible}
                onOpenChange={setUndoNoticeVisible}
                className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-4 text-sm shadow-xl"
              >
                <Toast.Title>
                  {recovery.label ?? "Zmiany zapisane"} · zapisano
                </Toast.Title>
                <Toast.Action altText="Cofnij ostatnią zapisaną zmianę" asChild>
                  <button
                    className="inline-flex items-center justify-center gap-2 rounded-xl border border-line bg-surface px-4 py-2.5 text-sm font-medium shadow-sm transition hover:border-accent/30 hover:bg-accent-soft"
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
                </Toast.Action>
                <Toast.Close asChild>
                  <button
                    className="inline-grid size-9 shrink-0 place-items-center rounded-lg text-muted transition hover:bg-accent-soft hover:text-accent"
                    aria-label="Zamknij powiadomienie"
                  >
                    ×
                  </button>
                </Toast.Close>
              </Toast.Root>
            )}
            {!meta ? (
              <div className="flex min-h-48 flex-col items-center justify-center gap-4 p-6 text-center text-sm text-muted">
                {error ? (
                  <button
                    className="inline-flex items-center justify-center gap-2 rounded-xl border border-line bg-surface px-4 py-2.5 text-sm font-medium shadow-sm transition hover:border-accent/30 hover:bg-accent-soft"
                    onClick={changed}
                  >
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
      <Toast.Viewport className="fixed bottom-4 right-4 z-50 flex w-[calc(100%-2rem)] max-w-lg flex-col gap-2 outline-none" />
    </Toast.Provider>
  );
}
