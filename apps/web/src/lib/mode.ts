import { useSyncExternalStore } from "react";

/**
 * The app's mode (issue #11): Build to write songs and prepare sets,
 * Perform to play them on stage. Each mode has its own look - Perform is
 * dark unless the player picks its light theme - and set songs open full
 * screen in Perform. Remembered on this device, not the account: the tablet
 * on the music stand performs while the laptop builds.
 */
export type AppMode = "build" | "perform";
export type PerformTheme = "dark" | "light";

const MODE_KEY = "songverse.mode";
const THEME_KEY = "songverse.performTheme";

/**
 * Sets <html>'s mode and theme: the ones given, or else what's stored.
 * Self-contained (no imports, literal keys) because it also runs as an
 * inline script before the page paints (MODE_SCRIPT), so a reload in
 * Perform never flashes light.
 */
function applyMode(mode?: string, theme?: string) {
  if (!mode || !theme) {
    mode = "build";
    theme = "dark";
    try {
      mode = localStorage.getItem("songverse.mode") === "perform" ? "perform" : "build";
      theme = localStorage.getItem("songverse.performTheme") === "light" ? "light" : "dark";
    } catch {
      // Storage blocked: the defaults.
    }
  }
  const root = document.documentElement;
  const dark = mode === "perform" && theme === "dark";
  root.dataset.mode = mode;
  root.classList.toggle("dark", dark);
  root.style.colorScheme = dark ? "dark" : "light";
}

export const MODE_SCRIPT = `(${applyMode.toString()})()`;

type Snapshot = { mode: AppMode; performTheme: PerformTheme };
const SERVER: Snapshot = { mode: "build", performTheme: "dark" };
let current: Snapshot | null = null;
const listeners = new Set<() => void>();

function snapshot(): Snapshot {
  if (!current) {
    let performTheme: PerformTheme = "dark";
    try {
      performTheme = localStorage.getItem(THEME_KEY) === "light" ? "light" : "dark";
    } catch {
      // Storage blocked: the default.
    }
    current = { mode: document.documentElement.dataset.mode === "perform" ? "perform" : "build", performTheme };
  }
  return current;
}

function save(next: Snapshot) {
  try {
    localStorage.setItem(MODE_KEY, next.mode);
    localStorage.setItem(THEME_KEY, next.performTheme);
  } catch {
    // Storage blocked: it lasts until the page is reloaded.
  }
  current = next;
  applyMode(next.mode, next.performTheme);
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  // Another tab switching mode switches this one too.
  const onStorage = (event: StorageEvent) => {
    if (event.key !== MODE_KEY && event.key !== THEME_KEY) return;
    applyMode();
    current = null;
    listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

export function setMode(mode: AppMode) {
  save({ ...snapshot(), mode });
}

export function setPerformTheme(performTheme: PerformTheme) {
  save({ ...snapshot(), performTheme });
}

/** The current mode and Perform theme; Build while rendering on the server. */
export function useMode(): Snapshot {
  return useSyncExternalStore(subscribe, snapshot, () => SERVER);
}
