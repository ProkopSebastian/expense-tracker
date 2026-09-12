import { useEffect, useRef } from "react";
import * as echarts from "echarts/core";
import { BarChart } from "echarts/charts";
import { GridComponent, TooltipComponent } from "echarts/components";
import { SVGRenderer } from "echarts/renderers";
import { money, monthLabel, monthShortLabel, type Summary } from "../api";

echarts.use([BarChart, GridComponent, TooltipComponent, SVGRenderer]);

export default function MonthlyBarChart({ data }: { data: Summary }) {
  const container = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!container.current || !data.monthly.length) return;
    const chart = echarts.init(container.current, undefined, {
      renderer: "svg",
    });
    chart.setOption({
      animation: !window.matchMedia("(prefers-reduced-motion: reduce)").matches,
      animationDuration: 350,
      grid: { left: 16, right: 16, top: 20, bottom: 15, containLabel: true },
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
        axisLabel: { color: "#798880" },
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
          type: "bar",
          barMaxWidth: 32,
          itemStyle: { borderRadius: 3 },
          data: data.monthly.map((p) => ({
            value: Number(p.change),
            itemStyle: { color: Number(p.change) >= 0 ? "#24846c" : "#c76565" },
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
  }, [data]);

  return (
    <section className="balance-panel">
      <div className="balance-heading">
        <div>
          <h2>Bilans miesięczny</h2>
          <p>Wynik każdego miesiąca osobno · ostatnie {data.monthly.length} mies.</p>
        </div>
      </div>
      {data.monthly.length ? (
        <div
          className="balance-chart"
          ref={container}
          role="img"
          aria-label="Bilans poszczególnych miesięcy, na plusie lub na minusie."
        />
      ) : (
        <p className="empty-state">Za mało danych, żeby pokazać miesiące.</p>
      )}
    </section>
  );
}
