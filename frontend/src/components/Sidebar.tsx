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
  summary: LayoutDashboard,
  ledger: History,
  classification: Sparkles,
  rules: Settings2,
};
export default function Sidebar({ page }: { page: Page }) {
  return (
    <aside className="sidebar">
      <a className="brand" href="#summary" aria-label="Wydatki — strona główna">
        <span className="brand-icon">
          <Wallet size={23} />
        </span>
        wydatki<span className="brand-dot">.</span>
      </a>
      <div className="workspace-label">TWOJE FINANSE</div>
      <nav aria-label="Nawigacja główna">
        {(Object.keys(pages) as Page[]).map((key) => {
          const Icon = icons[key];
          return (
            <a
              key={key}
              href={`#${key}`}
              className={`nav-item ${page === key ? "active" : ""}`}
              aria-current={page === key ? "page" : undefined}
              title={pages[key].title}
            >
              <Icon size={19} />
              <span>{pages[key].title}</span>
            </a>
          );
        })}
      </nav>
      <div className="sidebar-bottom">
        <LockKeyhole size={16} />
        <span>Lokalnie na Twoim komputerze</span>
      </div>
      <div className="profile">
        <span className="avatar">S</span>
        <div>
          <strong>Sebastian</strong>
          <span>Przestrzeń osobista</span>
        </div>
      </div>
    </aside>
  );
}
