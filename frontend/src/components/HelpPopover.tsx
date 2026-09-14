import * as Popover from "@radix-ui/react-popover";
import { Info } from "lucide-react";
import type { ReactNode } from "react";

export default function HelpPopover({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <Popover.Root>
      <Popover.Trigger
        aria-label={label}
        className="inline-grid size-6 shrink-0 place-items-center rounded-full text-muted transition hover:bg-accent-soft hover:text-accent"
      >
        <Info size={15} />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={6}
          className="z-50 w-72 rounded-xl border border-line bg-surface p-4 text-sm leading-relaxed text-muted shadow-xl"
        >
          {children}
          <Popover.Arrow className="fill-surface" />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
