import { useEffect, useRef } from "react";
import * as echarts from "echarts/core";
import { PieChart } from "echarts/charts";
import { SVGRenderer } from "echarts/renderers";
import type { BreakdownNode } from "../api";
import { money } from "../api";
import { ArrowLeft } from "lucide-react";

echarts.use([PieChart, SVGRenderer]);

const palette = [
  "#24846c",
  "#728ddd",
  "#df9d51",
  "#cf7294",
  "#789eae",
  "#a18ac3",
  "#9caa63",
  "#d48164",
];
const categoryColors: Record<string, string> = {
  food: palette[0],
  transport: palette[1],
  shopping: palette[2],
  entertainment: palette[3],
  travel: palette[4],
  housing: palette[5],
  health: palette[6],
  subscriptions: palette[7],
  uncategorized_expense: "#a0a8ae",
};
export function nodeColor(key: string): string {
  let hash = 0;
  for (const char of key) hash = (hash * 31 + char.charCodeAt(0)) | 0;
  return categoryColors[key] ?? palette[Math.abs(hash) % palette.length];
}

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
    observer.observe(container.current);
    return () => {
      observer.disconnect();
      instance.dispose();
      chart.current = null;
    };
  }, []);

  useEffect(() => {
    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    chart.current?.setOption({
      animation: !reduced,
      animationDuration: 600,
      animationDurationUpdate: 400,
      animationEasingUpdate: "cubicInOut",
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
          itemStyle: { borderRadius: 5 },
          data: nodes.map((node) => ({
            id: node.key,
            name: node.label,
            value: Number(node.total),
            itemStyle: { color: nodeColor(node.key) },
          })),
        },
      ],
    });
  }, [nodes]);

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
    <div className="donut-wrap">
      <div className="donut" ref={container} aria-hidden="true" />
      <button
        className="donut-center"
        onClick={onBack}
        disabled={!canGoBack}
        aria-label="Wróć o poziom wyżej"
      >
        <span className="donut-kicker">{title}</span>
        <strong>{money(total, currency)}</strong>
        <span className="donut-back">
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
