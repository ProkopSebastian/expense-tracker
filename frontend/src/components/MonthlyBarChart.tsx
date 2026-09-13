import { useEffect, useRef } from "react";
import * as echarts from "echarts/core";
import { BarChart } from "echarts/charts";
import { GridComponent, TooltipComponent } from "echarts/components";
import { SVGRenderer } from "echarts/renderers";
import { money, monthLabel, monthShortLabel, type Summary } from "../api";
import { themeVar, useThemeSignal } from "../theme";

echarts.use([BarChart, GridComponent, TooltipComponent, SVGRenderer]);

export default function MonthlyBarChart({ data }: { data: Summary }) {
  const container = useRef<HTMLDivElement>(null);
  const themeSignal = useThemeSignal();
  useEffect(() => {
    if (!container.current || !data.monthly.length) return;
    const chart = echarts.init(container.current, undefined, {
      renderer: "svg",
    });
    const success = themeVar("--app-success");
    const danger = themeVar("--app-danger");
    const surface = themeVar("--app-surface");
    const line = themeVar("--app-line");
    const ink = themeVar("--app-ink");
    const muted = themeVar("--app-muted");
    chart.setOption({
      animation: !window.matchMedia("(prefers-reduced-motion: reduce)").matches,
      animationDuration: 350,
      grid: { left: 16, right: 16, top: 20, bottom: 15, containLabel: true },
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
          const point = data.monthly[params[0].dataIndex];
          if (!point) return "";
          return `${monthLabel(point.month)}\nWynik miesiąca: ${money(point.change, data.currency)}`;
        },
      },
      xAxis: {
        type: "category",
        data: data.monthly.map((p) => monthShortLabel(p.month)),
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { color: muted },
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
          type: "bar",
          barMaxWidth: 32,
          itemStyle: { borderRadius: 8 },
          data: data.monthly.map((p) => ({
            value: Number(p.change),
            itemStyle: { color: Number(p.change) >= 0 ? success : danger },
          })),
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

  return (
    <section className="min-w-0 border-t border-line pt-6 xl:border-t-0 xl:border-l xl:pt-0 xl:pl-8">
      <h2>Bilans miesięczny</h2>
      {data.monthly.length ? (
        <div
          className="mt-4 h-[240px]"
          ref={container}
          role="img"
          aria-label="Bilans poszczególnych miesięcy, na plusie lub na minusie."
        />
      ) : (
        <p className="flex min-h-48 flex-col items-center justify-center gap-4 p-6 text-center text-sm text-muted">
          Za mało danych, żeby pokazać miesiące.
        </p>
      )}
    </section>
  );
}
