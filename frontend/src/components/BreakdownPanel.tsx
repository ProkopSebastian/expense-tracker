import CategoryIcon from "./CategoryIcon";
import * as Tabs from "@radix-ui/react-tabs";
import { useState } from "react";
import { PieChart, BarChart3, ChevronRight, Wallet } from "lucide-react";
import { money, type BreakdownNode, type Summary } from "../api";
import CategoryChart from "./CategoryChart";
import CategoryBarChart from "./CategoryBarChart";
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
      className="overflow-hidden"
    >
      <div className="flex flex-wrap items-center justify-between gap-4 pb-3">
        <h2
          className="flex flex-wrap items-center gap-1.5 [&_button]:rounded-md [&_button]:text-muted [&_button]:transition [&_button:hover]:text-accent"
          aria-label="Poziom kategorii"
        >
          {path.length ? (
            <button
              onClick={() => {
                setPath([]);
                setHovered(null);
              }}
            >
              Wydatki według kategorii
            </button>
          ) : (
            "Wydatki według kategorii"
          )}
          {path.map((node, index) => (
            <span key={node.key} className="flex items-center gap-1.5">
              <ChevronRight size={16} className="text-muted" />
              {index === path.length - 1 ? (
                node.label
              ) : (
                <button
                  onClick={() => {
                    setPath(path.slice(0, index + 1));
                    setHovered(null);
                  }}
                >
                  {node.label}
                </button>
              )}
            </span>
          ))}
        </h2>
        <Tabs.List
          className="segmented"
          aria-label="Rodzaj wykresu"
        >
          <Tabs.Trigger value="donut">
            <PieChart size={15} />
            Koło
          </Tabs.Trigger>
          <Tabs.Trigger value="bars">
            <BarChart3 size={15} />
            Słupki
          </Tabs.Trigger>
        </Tabs.List>
      </div>
      <Tabs.Content value={view} forceMount>
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
          <div className="grid items-center gap-6 py-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:gap-10">
            <div className="min-w-0">
              {view === "donut" ? (
                <>
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
                </>
              ) : (
                <CategoryBarChart
                  nodes={nodes}
                  currency={data.currency}
                  onSelect={selectNode}
                  hovered={hovered}
                  onHover={setHovered}
                />
              )}
            </div>
            <div className="flex min-w-0 flex-col justify-center self-stretch">
              <div className="flex items-center justify-between gap-2 px-2 pb-2 text-xs text-muted">
                <span>
                  {path.length > 1 ? "Sprzedawca" : "Kategoria"}{" "}
                  <span className="ml-1 rounded-md bg-accent-soft px-1.5 py-0.5 text-xs tracking-normal text-accent">
                    {nodes.length}
                  </span>
                </span>
                <span>Kwota / udział</span>
              </div>
              <div className="max-h-80 divide-y divide-line/40 overflow-y-auto">
                {nodes.map((node) => (
                  <button
                    key={node.key}
                    className={`grid w-full grid-cols-[minmax(0,1fr)_auto_16px] items-center gap-3 rounded-lg px-2 py-3 text-left transition-colors disabled:opacity-100! ${hovered === node.key ? "bg-accent-soft" : ""} ${node.children.length ? "hover:bg-accent-soft" : "[&>svg]:invisible"}`}
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
                    <ChevronRight className="text-muted" size={16} />
                  </button>
                ))}
              </div>
              <div className="flex justify-between gap-3 border-t border-line px-2 pt-4 text-sm [&_strong]:tabular-nums">
                <span>Razem</span>
                <strong>{money(currentTotal, data.currency)}</strong>
              </div>
            </div>
          </div>
        )}
      </Tabs.Content>
    </Tabs.Root>
  );
}
