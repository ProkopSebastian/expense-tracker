import { nodeColor } from "../categoryPresentation";
import { useEffect, useMemo, useRef } from "react";
import * as echarts from "echarts/core";
import { BarChart } from "echarts/charts";
import { GridComponent, TooltipComponent } from "echarts/components";
import { SVGRenderer } from "echarts/renderers";
import type { BreakdownNode } from "../api";
import { money } from "../api";
import { themeVar, useThemeSignal } from "../theme";

echarts.use([BarChart, GridComponent, TooltipComponent, SVGRenderer]);

const MAX_BARS = 8;
const OTHER_KEY = "__other__";

interface Props {
  nodes: BreakdownNode[];
  currency: string;
  hovered: string | null;
  onHover: (key: string | null) => void;
  onSelect: (node: BreakdownNode) => void;
}

function truncate(label: string) {
  return label.length > 12 ? `${label.slice(0, 11)}…` : label;
}

export default function CategoryBarChart({
  nodes,
  currency,
  hovered,
  onHover,
  onSelect,
}: Props) {
  const container = useRef<HTMLDivElement>(null);
  const chart = useRef<echarts.EChartsType | null>(null);
  const themeSignal = useThemeSignal();
  const bars = useMemo<BreakdownNode[]>(() => {
    const sorted = [...nodes].sort((a, b) => Number(b.total) - Number(a.total));
    const shown = sorted.slice(0, MAX_BARS);
    const rest = sorted.slice(MAX_BARS);
    if (!rest.length) return shown;
    const otherTotal = rest.reduce((sum, node) => sum + Number(node.total), 0);
    return [...shown, { key: OTHER_KEY, label: "Inne", total: String(otherTotal), children: [] }];
  }, [nodes]);
  const handlers = useRef({ onSelect, onHover, bars });
  handlers.current = { onSelect, onHover, bars };

  useEffect(() => {
    if (!container.current) return;
    const instance = echarts.init(container.current, undefined, {
      renderer: "svg",
    });
    chart.current = instance;
    instance.on("click", (params) => {
      const node = handlers.current.bars[params.dataIndex];
      if (node && node.key !== OTHER_KEY) handlers.current.onSelect(node);
    });
    instance.on("mouseover", (params) => {
      const node = handlers.current.bars[params.dataIndex];
      handlers.current.onHover(node && node.key !== OTHER_KEY ? node.key : null);
    });
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
    const surface = themeVar("--app-surface");
    const line = themeVar("--app-line");
    const ink = themeVar("--app-ink");
    const muted = themeVar("--app-muted");
    const option: echarts.EChartsCoreOption = {
      animation: !reduced,
      animationDuration: 400,
      animationEasing: "cubicOut",
      grid: { left: 8, right: 8, top: 20, bottom: 8, containLabel: true },
      tooltip: {
        trigger: "item",
        confine: true,
        renderMode: "html",
        transitionDuration: reduced ? 0 : 0.12,
        backgroundColor: surface,
        borderColor: line,
        borderWidth: 1,
        padding: 10,
        textStyle: { color: ink },
        extraCssText: "box-shadow: 0 4px 16px rgba(18, 62, 53, 0.12);",
        formatter: (params: { dataIndex: number }) => {
          const node = bars[params.dataIndex];
          if (!node) return "";
          return `${node.label}\n${money(node.total, currency)}`;
        },
      },
      xAxis: {
        type: "category",
        data: bars.map((node) => node.label),
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { color: muted, interval: 0, formatter: truncate },
      },
      yAxis: {
        type: "value",
        axisLabel: {
          color: muted,
          formatter: (value: number) => money(value, currency),
        },
        splitLine: { lineStyle: { color: line } },
      },
      series: [
        {
          type: "bar",
          barMaxWidth: 40,
          itemStyle: { borderRadius: 6 },
          emphasis: { itemStyle: { shadowBlur: 0 } },
          data: bars.map((node) => ({
            value: Number(node.total),
            itemStyle: { color: node.key === OTHER_KEY ? muted : nodeColor(node.key) },
          })),
        },
      ],
    };
    const instance = chart.current;
    if (!instance) return;
    instance.setOption(option, { replaceMerge: ["series"] });
  }, [bars, currency, themeSignal]);

  useEffect(() => {
    chart.current?.dispatchAction({ type: "downplay", seriesIndex: 0 });
    const index = bars.findIndex((node) => node.key === hovered);
    if (index >= 0)
      chart.current?.dispatchAction({
        type: "highlight",
        seriesIndex: 0,
        dataIndex: index,
      });
  }, [hovered, bars]);

  return (
    <div
      className="h-[280px] w-full"
      ref={container}
      role="img"
      aria-label="Wydatki w rozbiciu na kategorie."
    />
  );
}
