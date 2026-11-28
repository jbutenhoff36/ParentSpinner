import { useEffect, useState } from "react";

/** Chrome/Edge/Android hand us this event when the app can be installed. */
type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

let deferred: InstallEvent | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

export const isIOS = () =>
  /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
export const isStandalone = () =>
  window.matchMedia?.("(display-mode: standalone)").matches || (navigator as any).standalone === true;

/** Call once at startup, before React renders, so the event isn't missed. */
export function listenForInstall() {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred = e as InstallEvent;
    notify();
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    notify();
  });
}

export type InstallMode = "prompt" | "ios" | "manual" | "installed";

function currentMode(): InstallMode {
  if (isStandalone()) return "installed";
  if (deferred) return "prompt";
  if (isIOS()) return "ios";
  return "manual";
}

/** What kind of install help this device needs, and a function that starts it. */
export function useInstall() {
  const [mode, setMode] = useState<InstallMode>(currentMode);
  useEffect(() => {
    const l = () => setMode(currentMode());
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, []);
  const install = async (): Promise<boolean> => {
    if (!deferred) return false;
    const ev = deferred;
    deferred = null;
    await ev.prompt();
    const choice = await ev.userChoice.catch(() => ({ outcome: "dismissed" as const }));
    notify();
    return choice.outcome === "accepted";
  };
  return { mode, install };
}

const DISMISS_KEY = "kidspin-install-dismissed";
export function installDismissed() {
  try {
    return Number(localStorage.getItem(DISMISS_KEY) || 0) > Date.now();
  } catch {
    return false;
  }
}
/** Hide the home-screen banner for a month. */
export function dismissInstall() {
  try {
    localStorage.setItem(DISMISS_KEY, String(Date.now() + 30 * 24 * 3600 * 1000));
  } catch {
    /* storage blocked */
  }
}
