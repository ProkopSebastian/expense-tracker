import { nodeColor } from "../categoryPresentation";
import { useEffect, useRef } from "react";
import * as echarts from "echarts/core";
import { PieChart } from "echarts/charts";
import { TooltipComponent } from "echarts/components";
import { SVGRenderer } from "echarts/renderers";
import type { BreakdownNode } from "../api";
import { money } from "../api";
import { ArrowLeft } from "lucide-react";
import { themeVar, useThemeSignal } from "../theme";

echarts.use([PieChart, TooltipComponent, SVGRenderer]);

interface Props {
  nodes: BreakdownNode[];
  currency: string;
  title: string;
  canGoBack: boolean;
  onSelect: (node: BreakdownNode) => void;
  onBack: () => void;
  hovered: string | null;
  onHover: (key: string | null) => void;
}

export default function CategoryChart({
  nodes,
  currency,
  title,
  canGoBack,
  onSelect,
  onBack,
  hovered,
  onHover,
}: Props) {
  const container = useRef<HTMLDivElement>(null);
  const chart = useRef<echarts.EChartsType | null>(null);
  const themeSignal = useThemeSignal();
  const handlers = useRef({ onSelect, onHover, nodes });
  handlers.current = { onSelect, onHover, nodes };
  const total = nodes.reduce((sum, node) => sum + Number(node.total), 0);

  useEffect(() => {
    if (!container.current) return;
    const instance = echarts.init(container.current, undefined, {
      renderer: "svg",
    });
    chart.current = instance;
    instance.on("click", (params) => {
      const node = handlers.current.nodes[params.dataIndex];
      if (node) handlers.current.onSelect(node);
    });
    instance.on("mouseover", (params) =>
      handlers.current.onHover(
        handlers.current.nodes[params.dataIndex]?.key ?? null,
      ),
    );
    instance.on("globalout", () => handlers.current.onHover(null));
    const observer = new ResizeObserver(() => instance.resize());
    const observeResizes = () => observer.observe(container.current!);
    instance.on("finished", observeResizes);
    return () => {
      instance.off("finished", observeResizes);
      observer.disconnect();
      instance.dispose();
      chart.current = null;
    };
  }, []);

  useEffect(() => {
    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const option: echarts.EChartsCoreOption = {
      animation: !reduced,
      animationDuration: 400,
      animationEasing: "cubicInOut",
      animationDurationUpdate: 400,
      animationEasingUpdate: "cubicInOut",
      stateAnimation: {
        duration: reduced ? 0 : 140,
        easing: "cubicOut",
      },
      tooltip: {
        trigger: "item",
        confine: true,
        renderMode: "html",
        transitionDuration: reduced ? 0 : 0.12,
        backgroundColor: themeVar("--app-surface"),
        borderColor: themeVar("--app-line"),
        borderWidth: 1,
        padding: 10,
        textStyle: { color: themeVar("--app-ink") },
        extraCssText: "box-shadow: 0 4px 16px rgba(18, 62, 53, 0.12);",
        formatter: (params: {
          name: string;
          percent: number;
          data: { amount: number };
        }) => {
          const content = document.createElement("div");
          const name = document.createElement("div");
          const amount = document.createElement("div");
          name.textContent = params.name;
          const percent = Number.isFinite(params.percent) ? params.percent : 0;
          amount.textContent = `${money(params.data.amount, currency)} · ${percent}%`;
          content.append(name, amount);
          return content;
        },
      },
      series: [
        {
          type: "pie",
          id: "categories",
          radius: ["65%", "88%"],
          center: ["50%", "50%"],
          padAngle: 2,
          minAngle: 1,
          label: { show: false },
          emphasis: { scaleSize: 5, itemStyle: { shadowBlur: 0 } },
          itemStyle: { borderRadius: 9 },
          data: nodes.map((node) => ({
            id: node.key,
            name: node.label,
            value: Number(node.total),
            amount: Number(node.total),
            itemStyle: { color: nodeColor(node.key) },
          })),
        },
      ],
    };
    const instance = chart.current;
    if (!instance) return;
    instance.setOption(option);
  }, [nodes, currency, themeSignal]);

  useEffect(() => {
    chart.current?.dispatchAction({ type: "downplay", seriesIndex: 0 });
    const index = nodes.findIndex((node) => node.key === hovered);
    if (index >= 0)
      chart.current?.dispatchAction({
        type: "highlight",
        seriesIndex: 0,
        dataIndex: index,
      });
  }, [hovered, nodes]);

  return (
    <div className="relative mx-auto aspect-square w-full max-w-[390px]">
      <div className="size-full" ref={container} aria-hidden="true" />
      <button
        className="absolute left-[23%] top-[29%] flex h-[42%] w-[54%] flex-col items-center justify-center gap-3 rounded-full disabled:opacity-100! enabled:hover:bg-accent-soft [&_strong]:text-xl [&_strong]:font-semibold [&_strong]:tracking-tight [&_strong]:whitespace-nowrap sm:[&_strong]:text-2xl"
        onClick={onBack}
        disabled={!canGoBack}
        aria-label="Wróć o poziom wyżej"
      >
        <span className="max-w-full text-xs leading-snug wrap-anywhere text-muted">
          {title}
        </span>
        <strong>{money(total, currency)}</strong>
        <span className="flex items-center gap-1 text-[11px] text-muted">
          {canGoBack ? (
            <>
              <ArrowLeft size={14} /> Wróć
            </>
          ) : (
            "Wydatki w okresie"
          )}
        </span>
      </button>
    </div>
  );
}
