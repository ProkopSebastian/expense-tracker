import CategoryIcon from "./CategoryIcon";
import * as Tabs from "@radix-ui/react-tabs";
import { useState } from "react";
import {
  PieChart,
  BarChart3,
  ChevronRight,
  Wallet,
  ListFilter,
} from "lucide-react";
import { money, type BreakdownNode, type Summary } from "../api";
import CategoryChart from "./CategoryChart";
import { nodeColor } from "../categoryPresentation";
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
    <Tabs.Root
      value={view}
      onValueChange={(value) => setView(value as "donut" | "bars")}
      className="overflow-hidden rounded-2xl border border-line bg-white shadow-sm"
    >
      <div className="flex flex-wrap items-center justify-between gap-4 px-5 pb-4 pt-6 lg:px-7 [&_p]:mt-1.5 [&_p]:text-sm [&_p]:text-muted">
        <div>
          <h2>Na co wydajesz?</h2>
          <p>Od kategorii do pojedynczego sprzedawcy.</p>
        </div>
        <Tabs.List
          className="flex gap-1 rounded-xl border border-line bg-slate-50 p-1 [&_button]:flex [&_button]:items-center [&_button]:gap-2 [&_button]:rounded-lg [&_button]:px-3 [&_button]:py-2 [&_button]:text-sm [&_button[data-state=active]]:bg-white [&_button[data-state=active]]:text-accent [&_button[data-state=active]]:shadow-sm"
          aria-label="Rodzaj wykresu"
        >
          <Tabs.Trigger value="donut">
            <PieChart size={16} />
            Koło
          </Tabs.Trigger>
          <Tabs.Trigger value="bars">
            <BarChart3 size={16} />
            Słupki
          </Tabs.Trigger>
        </Tabs.List>
      </div>
      <div
        className="flex min-h-9 flex-wrap items-center gap-2 px-5 text-xs text-muted lg:px-7 [&>span]:flex [&>span]:items-center [&>span]:gap-2 [&_button]:rounded-md [&_button]:px-2 [&_button]:py-1 [&_button]:text-accent [&_button:disabled]:text-muted [&_button:disabled]:opacity-100"
        aria-label="Poziom kategorii"
      >
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
      <Tabs.Content value={view}>
        {!nodes.length ? (
          <div className="flex min-h-48 flex-col items-center justify-center gap-4 p-6 text-center text-sm text-muted">
            <Wallet size={30} />
            <h3>Brak wydatków w tym okresie</h3>
            <p>
              {data.currencies.length
                ? "Wybierz inny miesiąc lub zakres dat."
                : "Zaimportuj wyciągi w obecnej aplikacji i odśwież ten widok."}
            </p>
          </div>
        ) : (
          <div
            className={`grid items-center gap-6 p-5 lg:grid-cols-2 lg:p-7 ${view === "bars" ? "lg:grid-cols-1!" : ""}`}
          >
            {view === "donut" && (
              <div className="min-w-0">
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
                <p className="text-center text-xs text-muted">
                  {path.length
                    ? "Kliknij środek, żeby wrócić wyżej"
                    : "Kliknij kategorię, żeby zobaczyć szczegóły"}
                </p>
              </div>
            )}
            <div className="flex min-w-0 flex-col justify-center self-stretch">
              <div className="flex items-center justify-between gap-2 border-b border-line pb-3 text-[10px] font-medium tracking-wider text-muted">
                <span>
                  {path.length > 1 ? "SPRZEDAWCA" : "KATEGORIA"}{" "}
                  <span className="ml-1 rounded-md bg-accent-soft px-1.5 py-0.5 text-xs tracking-normal text-accent">
                    {nodes.length}
                  </span>
                </span>
                <span>KWOTA / UDZIAŁ</span>
              </div>
              <div className="max-h-80 overflow-y-auto">
                {nodes.map((node) => (
                  <button
                    key={node.key}
                    className={`grid w-full grid-cols-[minmax(0,1fr)_auto_16px] items-center gap-3 border-b border-line/60 px-2 py-3 text-left transition-colors disabled:opacity-100! ${hovered === node.key ? "bg-accent-soft" : ""} ${node.children.length ? "hover:bg-accent-soft" : "[&>svg]:invisible"}`}
                    disabled={!node.children.length}
                    onClick={() => selectNode(node)}
                    onMouseEnter={() => setHovered(node.key)}
                    onMouseLeave={() => setHovered(null)}
                    onFocus={() => setHovered(node.key)}
                    onBlur={() => setHovered(null)}
                  >
                    <span className="flex min-w-0 items-center gap-2.5 text-sm leading-relaxed [&>span:last-child]:wrap-anywhere">
                      <CategoryIcon categoryKey={node.key} />
                      <span>{node.label}</span>
                    </span>
                    <span className="flex flex-col gap-1 text-right whitespace-nowrap [&_strong]:text-sm [&_strong]:font-medium [&_strong]:tabular-nums [&>span]:text-[11px] [&>span]:text-muted">
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
                    <ChevronRight className="text-slate-400" size={16} />
                    {view === "bars" && (
                      <span className="col-span-full h-1.5 overflow-hidden rounded-full bg-slate-100 [&>span]:block [&>span]:h-full [&>span]:rounded-full">
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
              <div className="flex justify-between gap-3 pt-4 text-sm [&_strong]:tabular-nums">
                <span>Razem</span>
                <strong>{money(currentTotal, data.currency)}</strong>
              </div>
            </div>
          </div>
        )}
      </Tabs.Content>
      <footer className="flex items-start gap-2 border-t border-line bg-slate-50/70 px-5 py-4 text-xs leading-relaxed text-muted [&_svg]:shrink-0">
        <ListFilter size={15} />
        <span>Kwoty uwzględniają grupy, zwroty i Twój udział w wydatkach.</span>
      </footer>
    </Tabs.Root>
  );
}
