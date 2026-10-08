import { useSyncExternalStore } from "react";

/**
 * Whether Live stacks a song that segues or transitions into the next one
 * on the same page (issue #214), on this device: on unless turned off.
 */
const KEY = "songverse.live.stackSegues";
const listeners = new Set<() => void>();

function read(): boolean {
  try {
    return localStorage.getItem(KEY) !== "0";
  } catch {
    // Storage blocked: on.
    return true;
  }
}

export function setStackSegues(on: boolean) {
  try {
    localStorage.setItem(KEY, on ? "1" : "0");
  } catch {
    // Storage blocked: for this page only.
  }
  for (const listener of listeners) listener();
}

export function useStackSegues(): boolean {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    read,
    // The server can't know: on, as most devices have it.
    () => true,
  );
}
