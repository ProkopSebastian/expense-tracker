import { useEffect, useRef } from "react";
import * as echarts from "echarts/core";
import { LineChart } from "echarts/charts";
import { GridComponent, TooltipComponent } from "echarts/components";
import { SVGRenderer } from "echarts/renderers";
import { money, type Summary } from "../api";

echarts.use([LineChart, GridComponent, TooltipComponent, SVGRenderer]);

export default function BalanceChart({ data }: { data: Summary }) {
  const container = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!container.current || !data.daily.length) return;
    const chart = echarts.init(container.current, undefined, {
      renderer: "svg",
    });
    const points = [
      { date: "Początek okresu", change: "0", balance: "0" },
      ...data.daily,
    ];
    const lineColor = Number(data.balance) >= 0 ? "#24846c" : "#c76565";
    chart.setOption({
      animation: !window.matchMedia("(prefers-reduced-motion: reduce)").matches,
      animationDuration: 350,
      grid: { left: 16, right: 24, top: 25, bottom: 15, containLabel: true },
      tooltip: {
        trigger: "axis",
        confine: true,
        renderMode: "richText",
        backgroundColor: "#ffffff",
        borderColor: "#e7ece9",
        borderWidth: 1,
        padding: 10,
        textStyle: { color: "#123e35" },
        extraCssText: "box-shadow: 0 4px 16px rgba(18, 62, 53, 0.12);",
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
        axisLabel: { color: "#798880", hideOverlap: true },
      },
      yAxis: {
        type: "value",
        axisLabel: {
          color: "#798880",
          formatter: (value: number) => money(value, data.currency),
        },
        splitLine: { lineStyle: { color: "#edf1ee" } },
      },
      series: [
        {
          type: "line",
          data: points.map((p) => Number(p.balance)),
          showSymbol: false,
          lineStyle: { width: 2.5, color: lineColor },
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
  }, [data]);
  return (
    <section className="my-6 rounded-2xl border border-line bg-white p-5 shadow-sm lg:p-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start [&_p]:mt-2 [&_p]:text-xs [&_p]:leading-relaxed [&_p]:text-muted [&>strong]:text-2xl [&>strong]:whitespace-nowrap [&>strong]:tabular-nums">
        <div>
          <h2>Bilans narastająco</h2>
          <p>
            Od zera, dzień po dniu · po rozliczeniu grup i bez przelewów
            własnych
          </p>
        </div>
        <strong
          className={
            Number(data.balance) >= 0 ? "text-emerald-600" : "text-rose-600"
          }
        >
          {money(data.balance, data.currency)}
        </strong>
      </div>
      {data.daily.length ? (
        <div
          className="mt-4 h-[270px]"
          ref={container}
          role="img"
          aria-label={`Bilans od ${data.start} do ${data.end}. Początek 0, koniec ${money(data.balance, data.currency)}.`}
        />
      ) : (
        <p className="flex min-h-48 flex-col items-center justify-center gap-4 p-6 text-center text-sm text-muted">
          Brak operacji w tym okresie.
        </p>
      )}
    </section>
  );
}
