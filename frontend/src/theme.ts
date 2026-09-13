import { useEffect, useState } from "react";

export const themeOptions = [
  {
    id: "system",
    label: "Systemowy",
    description: "Dopasowuje się do ustawień urządzenia",
    colors: ["#7054d9", "#f6f7fc", "#22243d"],
  },
  {
    id: "light",
    label: "Jasny",
    description: "Spokojny fiolet i jasne tło",
    colors: ["#7054d9", "#ffffff", "#eef0f8"],
  },
  {
    id: "dark",
    label: "Ciemny",
    description: "Stonowany, wygodny wieczorem",
    colors: ["#9b8afb", "#1c1e2b", "#33354a"],
  },
  {
    id: "ocean",
    label: "Ocean",
    description: "Chłodny błękit i morski turkus",
    colors: ["#087e8b", "#ffffff", "#e6f4f5"],
  },
  {
    id: "forest",
    label: "Las",
    description: "Naturalna zieleń i ciepłe tło",
    colors: ["#34785a", "#fffefa", "#eaf3e9"],
  },
  {
    id: "rose",
    label: "Róż",
    description: "Ciepłe odcienie i śliwkowy akcent",
    colors: ["#aa5175", "#fffdfc", "#f8eaf0"],
  },
  {
    id: "sand",
    label: "Piasek",
    description: "Ciepły krem i miedziany akcent",
    colors: ["#a46038", "#fffdf8", "#f3e9d9"],
  },
  {
    id: "midnight",
    label: "Noc",
    description: "Głęboki granat i chłodny błękit",
    colors: ["#74b9dc", "#172632", "#283e4d"],
  },
  {
    id: "mocha",
    label: "Mokka",
    description: "Ciepły ciemny motyw z bursztynowym akcentem",
    colors: ["#d97706", "#292524", "#44403c"],
  },
  {
    id: "lavender",
    label: "Lawenda",
    description: "Chłodny, pastelowy fiolet",
    colors: ["#8b5cf6", "#ffffff", "#eceaf5"],
  },
  {
    id: "nord",
    label: "Nord",
    description: "Arktyczny chłód i mroźne błękity",
    colors: ["#88c0d0", "#3b4252", "#434c5e"],
  },
  {
    id: "dracula",
    label: "Dracula",
    description: "Neonowy mrok o wysokim kontraście",
    colors: ["#bd93f9", "#44475a", "#3a3c4e"],
  },
  {
    id: "gruvbox",
    label: "Gruvbox Dark",
    description: "Retro groove w ciepłych barwach ziemi",
    colors: ["#fe8019", "#3c3836", "#504945"],
  },
  {
    id: "one-dark",
    label: "One Dark",
    description: "Ciemny motyw inspirowany edytorem Atom",
    colors: ["#61afef", "#21252b", "#2c313a"],
  },
  {
    id: "tokyo-night",
    label: "Tokyo Night",
    description: "Głęboki granat z jasnymi akcentami",
    colors: ["#7aa2f7", "#24283b", "#292e42"],
  },
  {
    id: "catppuccin",
    label: "Catppuccin Macchiato",
    description: "Nowoczesny, pastelowy ciemny motyw",
    colors: ["#c6a0f6", "#363a4f", "#494d64"],
  },
] as const;

export type ThemePreference = (typeof themeOptions)[number]["id"];
const STORAGE_KEY = "theme";
const CHANGE_EVENT = "expense-tracker-theme-change";
let pendingSave = Promise.resolve();

function apply(preference: ThemePreference) {
  const root = document.documentElement;
  if (preference === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", preference);
}

function readStored(): ThemePreference {
  const stored = localStorage.getItem(STORAGE_KEY);
  return themeOptions.find((option) => option.id === stored)?.id ?? "system";
}

export function useTheme() {
  const [preference, setPreference] = useState<ThemePreference>(readStored);

  useEffect(() => {
    const sync = () => setPreference(readStored());
    window.addEventListener(CHANGE_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(CHANGE_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  function changePreference(next: ThemePreference) {
    localStorage.setItem(STORAGE_KEY, next);
    apply(next);
    setPreference(next);
    window.dispatchEvent(new Event(CHANGE_EVENT));
    pendingSave = pendingSave
      .catch(() => undefined)
      .then(async () => {
        const response = await fetch("/api/settings/appearance", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ theme: next }),
        });
        if (!response.ok) throw new Error("Nie udało się zapisać motywu.");
      });
    return pendingSave;
  }

  return [preference, changePreference] as const;
}

export function useResolvedTheme(preference: ThemePreference) {
  const query = "(prefers-color-scheme: dark)";
  const [systemDark, setSystemDark] = useState(
    () => window.matchMedia(query).matches,
  );

  useEffect(() => {
    const media = window.matchMedia(query);
    const handler = (event: MediaQueryListEvent) =>
      setSystemDark(event.matches);
    media.addEventListener("change", handler);
    return () => media.removeEventListener("change", handler);
  }, []);

  if (preference === "system") return systemDark ? "dark" : "light";
  return [
    "dark",
    "midnight",
    "mocha",
    "nord",
    "dracula",
    "gruvbox",
    "one-dark",
    "tokyo-night",
    "catppuccin",
  ].includes(preference)
    ? "dark"
    : "light";
}

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

export function themeVar(name: string) {
  return getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
}

apply(readStored());

export async function loadTheme() {
  try {
    const response = await fetch("/api/settings/appearance");
    if (!response.ok) return;
    const data: unknown = await response.json();
    if (!data || typeof data !== "object" || !("theme" in data)) return;
    const theme = themeOptions.find((option) => option.id === data.theme)?.id;
    if (!theme) return;
    localStorage.setItem(STORAGE_KEY, theme);
    apply(theme);
    window.dispatchEvent(new Event(CHANGE_EVENT));
  } catch {
    // Browser storage remains a fallback when the local API is unavailable.
  }
}
