import {
  Wallet,
  LayoutDashboard,
  History,
  Sparkles,
  Settings2,
  LockKeyhole,
} from "lucide-react";
import { pages, type Page } from "../domain";
const icons = {
  data: Wallet,
  summary: LayoutDashboard,
  ledger: History,
  classification: Sparkles,
  rules: Settings2,
};
export default function Sidebar({ page }: { page: Page }) {
  return (
    <aside className="sticky top-0 z-30 flex flex-col border-b border-line bg-white/95 p-4 backdrop-blur-xl md:h-screen md:border-r md:border-b-0 xl:px-5 xl:py-8 [&_nav]:mt-4 [&_nav]:flex [&_nav]:gap-2 md:[&_nav]:grid xl:[&_nav]:mt-0">
      <a
        className="flex items-center gap-2 text-2xl font-bold tracking-tight max-xl:justify-center md:max-xl:text-[0px]"
        href="#summary"
        aria-label="Wydatki — strona główna"
      >
        <span className="grid size-10 shrink-0 -rotate-6 place-items-center rounded-2xl bg-gradient-to-br from-accent to-blue-500 text-white shadow-lg shadow-accent/20">
          <Wallet size={23} />
        </span>
        wydatki<span className="-ml-2 text-accent md:max-xl:hidden">.</span>
      </a>
      <div className="mb-4 mt-12 hidden px-3 text-[10px] font-semibold tracking-[0.2em] text-muted xl:block">
        TWOJE FINANSE
      </div>
      <nav aria-label="Nawigacja główna">
        {(
          ["summary", "ledger", "classification", "rules", "data"] as Page[]
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
      <div className="mt-auto hidden items-center gap-2 pt-8 text-xs leading-relaxed text-muted xl:flex">
        <LockKeyhole size={16} />
        <span>Lokalnie na Twoim komputerze</span>
      </div>
    </aside>
  );
}
