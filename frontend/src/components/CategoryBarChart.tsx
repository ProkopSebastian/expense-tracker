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
    // A short bar is a tiny click/hover target if we only react to the drawn shape, so
    // treat the whole category column (full chart height, via axis position) as the target
    // instead of the bar's own pixel footprint.
    instance.on("updateAxisPointer", (event) => {
      const info = (event as { axesInfo?: { value?: number }[] }).axesInfo?.[0];
      const node = typeof info?.value === "number" ? handlers.current.bars[info.value] : undefined;
      handlers.current.onHover(node && node.key !== OTHER_KEY ? node.key : null);
    });
    instance.on("globalout", () => handlers.current.onHover(null));
    const handleClick = (event: MouseEvent) => {
      if (!container.current) return;
      const rect = container.current.getBoundingClientRect();
      const point: [number, number] = [event.clientX - rect.left, event.clientY - rect.top];
      if (!instance.containPixel("grid", point)) return;
      const index = Math.round(Number(instance.convertFromPixel({ xAxisIndex: 0 }, point[0])));
      const node = handlers.current.bars[index];
      if (node && node.key !== OTHER_KEY) handlers.current.onSelect(node);
    };
    container.current.addEventListener("click", handleClick);
    const observer = new ResizeObserver(() => instance.resize());
    const observeResizes = () => observer.observe(container.current!);
    instance.on("finished", observeResizes);
    return () => {
      instance.off("finished", observeResizes);
      container.current?.removeEventListener("click", handleClick);
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
      grid: { left: 8, right: 8, top: 20, bottom: 4, containLabel: true },
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "shadow", shadowStyle: { color: ink, opacity: 0.06 } },
        confine: true,
        renderMode: "html",
        transitionDuration: reduced ? 0 : 0.12,
        backgroundColor: surface,
        borderColor: line,
        borderWidth: 1,
        padding: 10,
        textStyle: { color: ink },
        extraCssText: "box-shadow: 0 4px 16px rgba(18, 62, 53, 0.12);",
        formatter: (params: { dataIndex: number }[]) => {
          const node = bars[params[0]?.dataIndex];
          if (!node) return "";
          const content = document.createElement("div");
          const name = document.createElement("div");
          const amount = document.createElement("div");
          name.textContent = node.label;
          amount.textContent = money(node.total, currency);
          content.append(name, amount);
          return content;
        },
      },
      xAxis: {
        type: "category",
        data: bars.map((node) => node.label),
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { show: false },
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
