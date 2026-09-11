import { useState } from "react";
import {
  PieChart,
  BarChart3,
  ChevronRight,
  Wallet,
  ListFilter,
} from "lucide-react";
import { money, type BreakdownNode, type Summary } from "../api";
import CategoryChart, { nodeColor } from "./CategoryChart";
export default function BreakdownPanel({ data }: { data: Summary }) {
  const [path, setPath] = useState<BreakdownNode[]>([]);
  const [hovered, setHovered] = useState<string | null>(null);
  const [view, setView] = useState<"donut" | "bars">("donut");
  const nodes = path.at(-1)?.children ?? data.breakdown;
  const currentTotal = nodes.reduce((sum, node) => sum + Number(node.total), 0);
  const selectNode = (node: BreakdownNode) => {
    if (node.children.length) {
      setPath((previous) => [...previous, node]);
      setHovered(null);
    }
  };
  return (
    <section className="breakdown-card">
      <div className="section-heading">
        <div>
          <h2>Na co wydajesz?</h2>
          <p>Od kategorii do pojedynczego sprzedawcy.</p>
        </div>
        <div className="chart-toggle" aria-label="Rodzaj wykresu">
          <button
            aria-pressed={view === "donut"}
            className={view === "donut" ? "selected" : ""}
            onClick={() => setView("donut")}
          >
            <PieChart size={16} />
            Koło
          </button>
          <button
            aria-pressed={view === "bars"}
            className={view === "bars" ? "selected" : ""}
            onClick={() => setView("bars")}
          >
            <BarChart3 size={16} />
            Słupki
          </button>
        </div>
      </div>
      <div className="breadcrumbs" aria-label="Poziom kategorii">
        <button
          onClick={() => {
            setPath([]);
            setHovered(null);
          }}
          disabled={!path.length}
        >
          Wszystkie wydatki
        </button>
        {path.map((node, index) => (
          <span key={node.key}>
            <ChevronRight size={14} />
            <button
              disabled={index === path.length - 1}
              onClick={() => {
                setPath(path.slice(0, index + 1));
                setHovered(null);
              }}
            >
              {node.label}
            </button>
          </span>
        ))}
      </div>
      {!nodes.length ? (
        <div className="empty-state">
          <Wallet size={30} />
          <h3>Brak wydatków w tym okresie</h3>
          <p>
            {data.currencies.length
              ? "Wybierz inny miesiąc lub zakres dat."
              : "Zaimportuj wyciągi w obecnej aplikacji i odśwież ten widok."}
          </p>
        </div>
      ) : (
        <div className={`chart-content ${view === "bars" ? "bar-view" : ""}`}>
          {view === "donut" && (
            <div className="chart-side">
              <CategoryChart
                nodes={nodes}
                currency={data.currency}
                title={path.at(-1)?.label ?? "Łącznie"}
                canGoBack={path.length > 0}
                onSelect={selectNode}
                onBack={() => {
                  setPath(path.slice(0, -1));
                  setHovered(null);
                }}
                hovered={hovered}
                onHover={setHovered}
              />
              <p className="chart-hint">
                {path.length
                  ? "Kliknij środek, żeby wrócić wyżej"
                  : "Kliknij kategorię, żeby zobaczyć szczegóły"}
              </p>
            </div>
          )}
          <div className="category-table">
            <div className="category-table-heading">
              <span>
                {path.length > 1 ? "SPRZEDAWCA" : "KATEGORIA"}{" "}
                <span className="count">{nodes.length}</span>
              </span>
              <span>KWOTA / UDZIAŁ</span>
            </div>
            <div className="category-rows">
              {nodes.map((node) => (
                <button
                  key={node.key}
                  className={`category-row ${hovered === node.key ? "hovered" : ""} ${node.children.length ? "drillable" : "leaf"}`}
                  disabled={!node.children.length}
                  onClick={() => selectNode(node)}
                  onMouseEnter={() => setHovered(node.key)}
                  onMouseLeave={() => setHovered(null)}
                  onFocus={() => setHovered(node.key)}
                  onBlur={() => setHovered(null)}
                >
                  <span className="category-name">
                    <span
                      className="color-dot"
                      style={{ background: nodeColor(node.key) }}
                    />
                    <span>{node.label}</span>
                  </span>
                  <span className="category-amount">
                    <strong>{money(node.total, data.currency)}</strong>
                    <span>
                      {new Intl.NumberFormat("pl-PL", {
                        maximumFractionDigits: 1,
                      }).format(
                        currentTotal
                          ? (Number(node.total) / currentTotal) * 100
                          : 0,
                      )}
                      %
                    </span>
                  </span>
                  <ChevronRight className="row-chevron" size={16} />
                  {view === "bars" && (
                    <span className="row-bar">
                      <span
                        style={{
                          width: `${currentTotal ? (Number(node.total) / currentTotal) * 100 : 0}%`,
                          background: nodeColor(node.key),
                        }}
                      />
                    </span>
                  )}
                </button>
              ))}
            </div>
            <div className="category-total">
              <span>Razem</span>
              <strong>{money(currentTotal, data.currency)}</strong>
            </div>
          </div>
        </div>
      )}
      <footer className="chart-footer">
        <ListFilter size={15} />
        <span>Kwoty uwzględniają grupy, zwroty i Twój udział w wydatkach.</span>
      </footer>
    </section>
  );
}
