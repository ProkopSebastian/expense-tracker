import {
  Wallet,
  LayoutDashboard,
  History,
  Sparkles,
  Settings2,
  LockKeyhole,
} from "lucide-react";
export default function Sidebar() {
  return (
    <aside className="sidebar">
      <a className="brand" href="/" aria-label="Wydatki — strona główna">
        <span className="brand-icon">
          <Wallet size={23} />
        </span>
        wydatki<span className="brand-dot">.</span>
      </a>
      <div className="workspace-label">TWOJE FINANSE</div>
      <nav aria-label="Nawigacja główna">
        <button className="nav-item active" aria-current="page">
          <LayoutDashboard size={19} />
          Podsumowanie
        </button>
        <button
          className="nav-item"
          disabled
          title="Dostępne w obecnej wersji Streamlit"
        >
          <History size={19} />
          Historia transakcji
        </button>
        <button
          className="nav-item"
          disabled
          title="Dostępne w obecnej wersji Streamlit"
        >
          <Sparkles size={19} />
          Do klasyfikacji
        </button>
        <button
          className="nav-item"
          disabled
          title="Dostępne w obecnej wersji Streamlit"
        >
          <Settings2 size={19} />
          Reguły sprzedawców
        </button>
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
