import { useEffect, useSyncExternalStore } from "react";

/**
 * Whether searches look in the songs' words too (issue #221): off unless
 * turned on, then remembered on the device, the same for the search box
 * and the library's.
 */
const KEY = "songverse.search.lyrics";
const listeners = new Set<() => void>();

function read(): boolean {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

export function useInLyrics(): [boolean, (on: boolean) => void] {
  const on = useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    read,
    () => false,
  );
  return [on, setInLyrics];
}

export function setInLyrics(on: boolean) {
  try {
    if (on) localStorage.setItem(KEY, "1");
    else localStorage.removeItem(KEY);
  } catch {
    // Storage blocked: not remembered.
  }
  for (const listener of listeners) listener();
}

/**
 * The line a song opens at, from a lyrics search: brought into view and
 * lit up for a moment - on the chart, or in the editor (whose lines are
 * the editor's own: lit up by a style, never by changing them). The first
 * of them on screen; false while there's none yet.
 */
export function revealLine(root: ParentNode, lineId: string): boolean {
  const id = CSS.escape(lineId);
  const selector = `[data-line-id="${id}"], [data-sv-line][data-id="${id}"]`;
  const line = [...root.querySelectorAll<HTMLElement>(selector)].find((element) => element.getClientRects().length > 0);
  if (!line) return false;
  line.scrollIntoView({ block: "center", behavior: "smooth" });
  let style = document.getElementById(FOUND_STYLE);
  if (!style) {
    style = document.createElement("style");
    style.id = FOUND_STYLE;
    document.head.append(style);
  }
  style.textContent = `:is(${selector}) { background-color: color-mix(in oklab, var(--color-amber-300) 40%, transparent); border-radius: 2px; }`;
  const shown = style;
  setTimeout(() => {
    if (shown.textContent?.includes(id)) shown.textContent = "";
  }, FOUND_MS);
  return true;
}

const FOUND_STYLE = "found-line";
const FOUND_MS = 2500;

/** On a page opened at a line (`?line=`): brought into view once the chart is drawn. */
export function useRevealLine(lineId: string | undefined) {
  useEffect(() => {
    if (!lineId) return;
    let tries = 0;
    let timer: ReturnType<typeof setTimeout>;
    const attempt = () => {
      if (revealLine(document, lineId) || ++tries > 30) return;
      timer = setTimeout(attempt, 150);
    };
    timer = setTimeout(attempt, 150);
    return () => clearTimeout(timer);
  }, [lineId]);
}
