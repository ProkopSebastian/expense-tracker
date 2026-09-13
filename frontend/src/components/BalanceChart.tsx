import { useEffect, useRef } from "react";
import * as echarts from "echarts/core";
import { LineChart } from "echarts/charts";
import { GridComponent, TooltipComponent } from "echarts/components";
import { SVGRenderer } from "echarts/renderers";
import { money, type Summary } from "../api";
import { themeVar, useThemeSignal } from "../theme";

echarts.use([LineChart, GridComponent, TooltipComponent, SVGRenderer]);

export default function BalanceChart({ data }: { data: Summary }) {
  const container = useRef<HTMLDivElement>(null);
  const themeSignal = useThemeSignal();
  useEffect(() => {
    if (!container.current || !data.daily.length) return;
    const chart = echarts.init(container.current, undefined, {
      renderer: "svg",
    });
    const points = [
      { date: "Początek okresu", change: "0", balance: "0" },
      ...data.daily,
    ];
    const success = themeVar("--app-success");
    const danger = themeVar("--app-danger");
    const surface = themeVar("--app-surface");
    const line = themeVar("--app-line");
    const ink = themeVar("--app-ink");
    const muted = themeVar("--app-muted");
    const lineColor = Number(data.balance) >= 0 ? success : danger;
    chart.setOption({
      animation: !window.matchMedia("(prefers-reduced-motion: reduce)").matches,
      animationDuration: 650,
      animationDelay: 100,
      animationEasing: "cubicOut",
      grid: { left: 16, right: 24, top: 25, bottom: 15, containLabel: true },
      tooltip: {
        trigger: "axis",
        confine: true,
        renderMode: "richText",
        backgroundColor: surface,
        borderColor: line,
        borderWidth: 1,
        padding: 10,
        textStyle: { color: ink },
        extraCssText: "box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);",
        formatter: (params: { dataIndex: number }[]) => {
          const point = points[params[0].dataIndex];
          if (!point) return "";
          return `${point.date}\nWynik dnia: ${money(point.change, data.currency)}\nNarastająco: ${money(point.balance, data.currency)}`;
        },
      },
      xAxis: {
        type: "category",
        boundaryGap: false,
        data: points.map((p) => p.date),
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { color: muted, hideOverlap: true },
      },
      yAxis: {
        type: "value",
        axisLabel: {
          color: muted,
          formatter: (value: number) => money(value, data.currency),
        },
        splitLine: { lineStyle: { color: line } },
      },
      series: [
        {
          type: "line",
          data: points.map((p) => Number(p.balance)),
          showSymbol: false,
          lineStyle: {
            width: 3,
            color: lineColor,
            cap: "round",
            join: "round",
          },
          areaStyle: { opacity: 0.07, color: lineColor },
          emphasis: { disabled: true },
        },
      ],
    });
    const observer = new ResizeObserver(() => chart.resize());
    observer.observe(container.current);
    return () => {
      observer.disconnect();
      chart.dispose();
    };
  }, [data, themeSignal]);
  return data.daily.length ? (
    <div
      className="chart-enter-daily h-[190px]"
      ref={container}
      role="img"
      aria-label={`Bilans od ${data.start} do ${data.end}. Początek 0, koniec ${money(data.balance, data.currency)}.`}
    />
  ) : (
    <p className="flex min-h-48 flex-col items-center justify-center gap-4 p-6 text-center text-sm text-muted">
      Brak operacji w tym okresie.
    </p>
  );
}
