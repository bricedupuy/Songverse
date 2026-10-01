import { useSyncExternalStore } from "react";

/**
 * How many columns a chart flows into (issue #177): as many as fit (auto),
 * or 1, 2 or 3 - newspaper-style, a section never split between two. Kept
 * on the device: it's the screen's choice as much as the reader's.
 */
export const CHART_COLUMNS = ["auto", "1", "2", "3"] as const;
export type ChartColumns = (typeof CHART_COLUMNS)[number];

const KEY = "songverse.chart.columns";
const listeners = new Set<() => void>();

function read(): ChartColumns {
  try {
    const stored = localStorage.getItem(KEY);
    return (CHART_COLUMNS as readonly string[]).includes(stored ?? "") ? (stored as ChartColumns) : "auto";
  } catch {
    return "auto";
  }
}

export function setChartColumns(value: ChartColumns) {
  try {
    localStorage.setItem(KEY, value);
  } catch {
    // Storage blocked: for this page only.
  }
  memory = value;
  for (const listener of listeners) listener();
}

let memory: ChartColumns | null = null;

export function useChartColumns(): ChartColumns {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      const onStorage = (event: StorageEvent) => {
        if (event.key === KEY) {
          memory = null;
          listener();
        }
      };
      window.addEventListener("storage", onStorage);
      return () => {
        listeners.delete(listener);
        window.removeEventListener("storage", onStorage);
      };
    },
    () => (memory ??= read()),
    () => "1",
  );
}
