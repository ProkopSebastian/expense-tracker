import {
  Banknote,
  ChartNoAxesCombined,
  ReceiptText,
  Tags,
  ListChecks,
  FolderArchive,
  Settings2,
} from "lucide-react";
import { useEffect, useState } from "react";
import { pages, type Page } from "../domain";
import { changelog, releasesSince } from "../changelog";
import SettingsDialog from "./SettingsDialog";
import OnboardingTour from "./OnboardingTour";
import WhatsNewModal from "./WhatsNewModal";
import { useUpdates } from "../updates";

const ONBOARDING_SEEN_KEY = "onboarding-seen";
const CHANGELOG_SEEN_KEY = "changelog-seen-version";
const icons = {
  data: FolderArchive,
  summary: ChartNoAxesCombined,
  ledger: ReceiptText,
  wallets: Banknote,
  classification: Tags,
  rules: ListChecks,
};
export default function Sidebar({
  page,
  aiEnabled,
  onChanged,
  onDataReset,
}: {
  page: Page;
  aiEnabled: boolean;
  onChanged: () => void;
  onDataReset: (apiKeyPreserved: boolean) => void;
}) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const updates = useUpdates();
  const updateAvailable = ["available", "ready"].includes(updates.status?.state ?? "");
  const [tourOpen, setTourOpen] = useState(false);
  const [whatsNewOpen, setWhatsNewOpen] = useState(false);
  const [seenVersion, setSeenVersion] = useState<string | null>(null);
  const latestVersion = changelog[0]?.version;
  useEffect(() => {
    try {
      if (!localStorage.getItem(ONBOARDING_SEEN_KEY)) {
        setTourOpen(true);
        // A first-time visitor has no prior version to compare against.
        if (latestVersion) localStorage.setItem(CHANGELOG_SEEN_KEY, latestVersion);
        return;
      }
      const stored = localStorage.getItem(CHANGELOG_SEEN_KEY);
      if (latestVersion && stored !== latestVersion) {
        setSeenVersion(stored);
        setWhatsNewOpen(true);
      }
    } catch {
      // Private mode or blocked storage: skip the automatic prompts, manual entry still works.
    }
  }, [latestVersion]);
  function closeTour() {
    setTourOpen(false);
    try {
      localStorage.setItem(ONBOARDING_SEEN_KEY, "1");
    } catch {
      // Ignore: nothing to persist, tour just reopens next visit.
    }
  }
  function closeWhatsNew() {
    setWhatsNewOpen(false);
    try {
      if (latestVersion) localStorage.setItem(CHANGELOG_SEEN_KEY, latestVersion);
    } catch {
      // Ignore: nothing to persist, notice just reopens next visit.
    }
  }
  return (
    <>
      <aside className="sticky top-0 z-30 flex flex-col border-b border-line bg-surface/95 p-4 backdrop-blur-xl md:h-screen md:border-r md:border-b-0 xl:px-5 xl:py-8 [&_nav]:mt-4 [&_nav]:flex [&_nav]:gap-2 md:[&_nav]:grid xl:[&_nav]:mt-10">
        <a
          className="flex items-center gap-2 text-2xl font-bold tracking-tight text-ink max-xl:justify-center md:max-xl:text-[0px]"
          href="#summary"
          aria-label="Wydatki — strona główna"
        >
          <img src="/logo.svg" alt="" width={48} height={48} className="size-12 shrink-0" />
          Wydatki
        </a>
        <nav aria-label="Nawigacja główna">
          {(
            ["summary", "ledger", "wallets", "classification", "rules", "data"] as Page[]
          ).map((key) => {
            const Icon = icons[key];
            return (
              <a
                key={key}
                href={`#${key}`}
                className={`flex flex-1 items-center justify-center gap-3 rounded-xl px-3 py-3 text-sm text-muted transition-colors hover:bg-accent-soft hover:text-accent aria-[current=page]:bg-accent-soft aria-[current=page]:font-semibold aria-[current=page]:text-accent xl:justify-start [&_span]:hidden xl:[&_span]:inline`}
                aria-current={page === key ? "page" : undefined}
                title={pages[key].title}
              >
                <Icon size={19} />
                <span>{pages[key].title}</span>
              </a>
            );
          })}
        </nav>
        <button
          type="button"
          className="mt-3 flex items-center justify-center gap-3 rounded-xl px-3 py-3 text-sm text-muted transition-colors hover:bg-accent-soft hover:text-accent md:mt-auto xl:justify-start"
          onClick={() => {
            setSettingsOpen(true);
            window.dispatchEvent(new Event("wydatki-update-refresh"));
          }}
          title={updateAvailable ? "Ustawienia — dostępna aktualizacja" : "Ustawienia aplikacji"}
          aria-label={updateAvailable ? "Ustawienia — dostępna aktualizacja" : "Ustawienia aplikacji"}
        >
          <Settings2 size={19} />
          <span className="hidden xl:inline">Ustawienia</span>
          {updateAvailable && <span className="size-2 rounded-full bg-accent" aria-hidden="true" />}
        </button>
      </aside>
      {settingsOpen && (
        <SettingsDialog
          updates={updates}
          aiEnabled={aiEnabled}
          onChanged={onChanged}
          onClose={() => setSettingsOpen(false)}
          onDataReset={onDataReset}
          onOpenTour={() => {
            setSettingsOpen(false);
            setTourOpen(true);
          }}
        />
      )}
      {tourOpen && <OnboardingTour onClose={closeTour} />}
      {whatsNewOpen && (
        <WhatsNewModal releases={releasesSince(seenVersion)} onClose={closeWhatsNew} />
      )}
    </>
  );
}
