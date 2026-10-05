import { useEffect, useRef } from "react";
import * as echarts from "echarts/core";
import { LineChart } from "echarts/charts";
import { GridComponent, TooltipComponent } from "echarts/components";
import { SVGRenderer } from "echarts/renderers";
import langPL from "echarts/lib/i18n/langPL.js";
import { dayLabel, money } from "../api";
import type { Snapshot } from "../domain";
import { themeVar, useThemeSignal } from "../theme";

echarts.use([LineChart, GridComponent, TooltipComponent, SVGRenderer]);
echarts.registerLocale("PL", langPL);

const compactMoney = new Intl.NumberFormat("pl-PL", {
  notation: "compact",
  style: "currency",
  currency: "PLN",
});

export default function WealthChart({ snapshots }: { snapshots: Snapshot[] }) {
  const container = useRef<HTMLDivElement>(null);
  const themeSignal = useThemeSignal();
  useEffect(() => {
    if (!container.current || !snapshots.length) return;
    const chart = echarts.init(container.current, undefined, {
      renderer: "svg",
      locale: "PL",
    });
    const accent = themeVar("--app-accent");
    const surface = themeVar("--app-surface");
    const line = themeVar("--app-line");
    const ink = themeVar("--app-ink");
    const muted = themeVar("--app-muted");
    chart.setOption({
      animation: !window.matchMedia("(prefers-reduced-motion: reduce)").matches,
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
          const snapshot = snapshots[params[0].dataIndex];
          return snapshot
            ? `${dayLabel(snapshot.day)}\n${money(snapshot.total, "PLN")}`
            : "";
        },
      },
      // A time axis spaces snapshots by the days between them, not by their count.
      xAxis: {
        type: "time",
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { color: muted, hideOverlap: true },
      },
      yAxis: {
        type: "value",
        scale: true,
        axisLabel: {
          color: muted,
          formatter: (value: number) => compactMoney.format(value),
        },
        splitLine: { lineStyle: { color: line } },
      },
      series: [
        {
          type: "line",
          animationDuration: 800,
          animationEasing: "cubicOut",
          data: snapshots.map((snapshot) => [
            snapshot.day,
            Number(snapshot.total),
          ]),
          symbolSize: 7,
          itemStyle: { color: accent },
          lineStyle: { width: 3, color: accent, cap: "round", join: "round" },
          areaStyle: { opacity: 0.07, color: accent },
          emphasis: { disabled: true },
        },
      ],
    });
    const observer = new ResizeObserver(() => chart.resize());
    const observeResizes = () => observer.observe(container.current!);
    chart.on("finished", observeResizes);
    return () => {
      chart.off("finished", observeResizes);
      observer.disconnect();
      chart.dispose();
    };
  }, [snapshots, themeSignal]);
  const last = snapshots.at(-1);
  return (
    <div
      className="h-[260px]"
      ref={container}
      role="img"
      aria-label={
        last
          ? `Wartość majątku od ${dayLabel(snapshots[0].day)} do ${dayLabel(last.day)}. Ostatnio ${money(last.total, "PLN")}.`
          : "Brak zapisanych stanów."
      }
    />
  );
}
