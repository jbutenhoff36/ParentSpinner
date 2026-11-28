import { useEffect, useState } from "react";

export type ThemeChoice = "light" | "dark" | "system";
const KEY = "kidspin-theme";
const listeners = new Set<(t: ThemeChoice) => void>();

export function getTheme(): ThemeChoice {
  try {
    const v = localStorage.getItem(KEY);
    if (v === "light" || v === "dark") return v;
  } catch {
    /* storage blocked */
  }
  return "system";
}

const systemDark = () => window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;

/** Put the right class on <html> and update the browser bar colour. */
export function applyTheme(choice: ThemeChoice = getTheme()) {
  const dark = choice === "dark" || (choice === "system" && systemDark());
  const root = document.documentElement;
  root.classList.toggle("dark", dark);
  root.style.colorScheme = dark ? "dark" : "light";
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute("content", dark ? "#0E0C1D" : "#FAF8F5"));
}

export function setTheme(choice: ThemeChoice) {
  try {
    if (choice === "system") localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, choice);
  } catch {
    /* storage blocked: still apply for this visit */
  }
  applyTheme(choice);
  listeners.forEach((l) => l(choice));
}

/** Keep following the device when the choice is "system". */
export function watchSystemTheme() {
  const mql = window.matchMedia?.("(prefers-color-scheme: dark)");
  mql?.addEventListener?.("change", () => getTheme() === "system" && applyTheme("system"));
}

export function useTheme(): [ThemeChoice, (t: ThemeChoice) => void] {
  const [theme, set] = useState<ThemeChoice>(getTheme);
  useEffect(() => {
    listeners.add(set);
    return () => {
      listeners.delete(set);
    };
  }, []);
  return [theme, setTheme];
}
