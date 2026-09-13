import * as Tabs from "@radix-ui/react-tabs";
import type { Summary } from "../api";
import BalanceChart from "./BalanceChart";
import MonthlyBarChart from "./MonthlyBarChart";

export default function BalanceTimeline({ data }: { data: Summary }) {
  return (
    <Tabs.Root
      defaultValue="daily"
      className="min-w-0 lg:border-l lg:border-line lg:pl-8"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2>Bilans w czasie</h2>
        <Tabs.List
          aria-label="Widok bilansu"
          className="flex gap-1 rounded-lg bg-surface-muted p-1 [&_button]:rounded-md [&_button]:px-3 [&_button]:py-1.5 [&_button]:text-xs [&_button]:text-muted [&_button[data-state=active]]:bg-surface [&_button[data-state=active]]:font-medium [&_button[data-state=active]]:text-ink [&_button[data-state=active]]:shadow-sm"
        >
          <Tabs.Trigger value="daily">Dziennie</Tabs.Trigger>
          <Tabs.Trigger value="monthly">Miesięcznie</Tabs.Trigger>
        </Tabs.List>
      </div>
      <Tabs.Content value="daily" className="mt-3">
        <BalanceChart data={data} />
      </Tabs.Content>
      <Tabs.Content value="monthly" className="mt-3">
        <MonthlyBarChart data={data} />
      </Tabs.Content>
    </Tabs.Root>
  );
}
