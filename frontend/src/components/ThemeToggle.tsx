import * as Switch from "@radix-ui/react-switch";
import { Moon, Sun } from "lucide-react";
import { useResolvedTheme, useTheme } from "../theme";

export default function ThemeToggle() {
  const [preference, setPreference] = useTheme();
  const resolved = useResolvedTheme(preference);
  const dark = resolved === "dark";

  return (
    <label className="flex items-center gap-2 text-muted">
      <Sun size={15} className={dark ? "" : "text-accent"} />
      <Switch.Root
        checked={dark}
        onCheckedChange={(checked) => setPreference(checked ? "dark" : "light")}
        className="relative h-6 w-11 shrink-0 rounded-full bg-line transition-colors data-[state=checked]:bg-accent"
        aria-label={dark ? "Przełącz na tryb jasny" : "Przełącz na tryb ciemny"}
      >
        <Switch.Thumb className="block size-4.5 translate-x-1 rounded-full bg-surface shadow-sm transition-transform will-change-transform data-[state=checked]:translate-x-[22px]" />
      </Switch.Root>
      <Moon size={15} className={dark ? "text-accent" : ""} />
    </label>
  );
}
