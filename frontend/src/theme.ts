import { useEffect, useState } from "react";

export type ThemePreference = "system" | "light" | "dark";
const STORAGE_KEY = "theme";

function apply(preference: ThemePreference) {
  const root = document.documentElement;
  if (preference === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", preference);
}

function readStored(): ThemePreference {
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored === "light" || stored === "dark" ? stored : "system";
}

export function useTheme() {
  const [preference, setPreference] = useState<ThemePreference>(readStored);

  useEffect(() => {
    apply(preference);
    localStorage.setItem(STORAGE_KEY, preference);
  }, [preference]);

  return [preference, setPreference] as const;
}

/** Aktualnie obowiązujący motyw (rozstrzyga "system" wg preferencji OS). Do użytku w kodzie JS, np. kolory wykresów ECharts. */
export function useResolvedTheme(preference: ThemePreference) {
  const query = "(prefers-color-scheme: dark)";
  const [systemDark, setSystemDark] = useState(
    () => window.matchMedia(query).matches,
  );

  useEffect(() => {
    const media = window.matchMedia(query);
    const handler = (event: MediaQueryListEvent) => setSystemDark(event.matches);
    media.addEventListener("change", handler);
    return () => media.removeEventListener("change", handler);
  }, []);

  if (preference === "system") return systemDark ? "dark" : "light";
  return preference;
}

/** Rośnie za każdym razem, gdy realnie zmieni się motyw (ręcznie albo wg systemu) — do dependency array w efektach np. wykresów ECharts. */
export function useThemeSignal() {
  const [signal, setSignal] = useState(0);

  useEffect(() => {
    const bump = () => setSignal((value) => value + 1);
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    media.addEventListener("change", bump);
    const observer = new MutationObserver(bump);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    return () => {
      media.removeEventListener("change", bump);
      observer.disconnect();
    };
  }, []);

  return signal;
}

/** Odczytuje aktualną wartość zmiennej CSS motywu (np. do konfiguracji kolorów ECharts, które nie rozumieją `var(...)`). */
export function themeVar(name: string) {
  return getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
}
