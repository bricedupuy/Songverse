import { chartSeconds, type RenderedChart } from "@songverse/core";
import { AArrowDown, AArrowUp, ChevronLeft, ChevronRight, Expand, Pause, Play, Rabbit, Shrink, Turtle, X } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { CommandSearch } from "#/components/command-search";
import { ModeSwitch } from "#/components/mode-switch";
import { OfflineBanner } from "#/components/offline-banner";
import { SongChart } from "#/components/song-chart";

const TEXT_SIZE_KEY = "songverse.liveTextSize";
const TEXT_SIZES = [1, 1.25, 1.5, 1.75, 2, 2.5, 3];
const DEFAULT_TEXT_SIZE = 1.5;
const PHONE_TEXT_SIZE = 1.25;
const SPEEDS = [0.5, 0.6, 0.7, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2];

/** What the Live view shows: a song of a set, or one pulled up on its own (issue #48). */
export interface LiveSong {
  /** Changes with the song shown, which then starts at its top. */
  id: string;
  title: string;
  /** Where it's from ("Sunday service · 2 / 5"); null for a song on its own. */
  context: string | null;
  /** Null when the player can't read the song. */
  chart: RenderedChart | null;
  durationSeconds: number | null | undefined;
  arrangementName: string | null;
  notes: { label?: string; text: string }[];
  /** The × at the top left: back to the set, or wherever the song was pulled up from. */
  exit: { label: string; go: () => void };
  /** Going through a set; both null for a song on its own. */
  previous: (() => void) | null;
  next: (() => void) | null;
  /** "Next: …" or "End of the set"; null for a song on its own. */
  nextLabel: string | null;
}

/**
 * A song full screen, to play from (Live mode, issues #29, #47 and #48): the
 * chart big, as this player reads it, what's next, and autoscroll paced by
 * the tempo. Keeps the screen awake. Keys (and page-turner pedals, which
 * send them): Space starts and pauses autoscroll, the up and down arrows
 * and Page Up/Down scroll, the left and right arrows change song.
 */
export function LiveView({ song }: { song: LiveSong }) {
  const { t } = useTranslation();
  const scroller = useRef<HTMLElement>(null);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [textSize, setTextSize] = useState(DEFAULT_TEXT_SIZE);
  const fullScreen = useFullScreen();
  useWakeLock();

  const { chart } = song;
  const seconds = chart ? chartSeconds(chart, song.durationSeconds) : 0;

  // The player's text size, from the last time (after hydrating: the server can't know it).
  useEffect(() => {
    try {
      const stored = Number(localStorage.getItem(TEXT_SIZE_KEY));
      if (TEXT_SIZES.includes(stored)) return setTextSize(stored);
    } catch {
      // Storage blocked: the default.
    }
    // A phone's lines are short: a size down, so fewer of them wrap.
    if (window.innerWidth < 640) setTextSize(PHONE_TEXT_SIZE);
  }, []);
  function changeTextSize(step: 1 | -1) {
    const next = TEXT_SIZES[Math.min(TEXT_SIZES.length - 1, Math.max(0, TEXT_SIZES.indexOf(textSize) + step))]!;
    setTextSize(next);
    try {
      localStorage.setItem(TEXT_SIZE_KEY, String(next));
    } catch {
      // Storage blocked: it lasts for this page.
    }
  }
  function changeSpeed(step: 1 | -1) {
    setSpeed(SPEEDS[Math.min(SPEEDS.length - 1, Math.max(0, SPEEDS.indexOf(speed) + step))]!);
  }

  // Each song starts at its top, not scrolling, at its own pace.
  useEffect(() => {
    setPlaying(false);
    setSpeed(1);
    scroller.current?.scrollTo({ top: 0 });
  }, [song.id]);

  // Autoscroll: the whole chart over the time it takes to play, nudged by `speed`.
  useEffect(() => {
    const element = scroller.current;
    if (!playing || !element || seconds <= 0) return;
    let position = element.scrollTop;
    let last = performance.now();
    let frame = requestAnimationFrame(function step(now) {
      const distance = element.scrollHeight - element.clientHeight;
      // Scrolled by hand meanwhile: carry on from there.
      if (Math.abs(element.scrollTop - Math.round(position)) > 2) position = element.scrollTop;
      position = Math.min(distance, position + ((distance / seconds) * speed * (now - last)) / 1000);
      last = now;
      element.scrollTop = position;
      if (position >= distance) setPlaying(false);
      else frame = requestAnimationFrame(step);
    });
    return () => cancelAnimationFrame(frame);
  }, [playing, speed, seconds]);

  const { previous, next } = song;
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.altKey || event.ctrlKey || event.metaKey || event.defaultPrevented) return;
      // The search dialog, say, has its own keys.
      if (document.querySelector("[role=dialog]")) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable=true]")) return;
      const element = scroller.current;
      const page = (element?.clientHeight ?? 0) * 0.8;
      switch (event.key) {
        case " ":
          // A focused button handles its own Space.
          if (target?.closest("button, a")) return;
          setPlaying((p) => !p);
          break;
        case "ArrowDown":
        case "PageDown":
          element?.scrollBy({ top: page, behavior: "smooth" });
          break;
        case "ArrowUp":
        case "PageUp":
          element?.scrollBy({ top: -page, behavior: "smooth" });
          break;
        case "ArrowRight":
          next?.();
          break;
        case "ArrowLeft":
          previous?.();
          break;
        default:
          return;
      }
      event.preventDefault();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [previous, next]);

  const details = [
    chart?.key,
    chart?.capo ? t("player.capo", { capo: chart.capo }) : null,
    chart?.tempo ? `${chart.tempo} BPM` : null,
    song.arrangementName,
  ].filter(Boolean);
  const inSet = song.nextLabel !== null;

  return (
    <div className="flex h-dvh flex-col bg-background text-foreground" data-testid="live-view">
      <header className="flex shrink-0 items-center gap-2 border-b-2 border-b-primary px-2 py-2 sm:gap-3 sm:px-4">
        <IconButton label={song.exit.label} onClick={song.exit.go}>
          <X />
        </IconButton>
        <div className="flex min-w-0 flex-1 flex-col">
          {song.context ? <p className="truncate text-xs text-muted-foreground">{song.context}</p> : null}
          <h1 className="truncate text-lg font-semibold sm:text-xl">{song.title}</h1>
        </div>
        {details.length > 0 ? (
          <p className="hidden shrink-0 text-sm font-medium text-muted-foreground lg:block" data-testid="live-details">
            {details.join(" · ")}
          </p>
        ) : null}
        <OfflineBanner compact />
        <CommandSearch />
        {fullScreen.available ? (
          <span className="hidden sm:contents">
            <IconButton label={t("live.fullScreen")} pressed={fullScreen.active} onClick={fullScreen.toggle}>
              {fullScreen.active ? <Shrink /> : <Expand />}
            </IconButton>
          </span>
        ) : null}
        <ModeSwitch />
      </header>

      <main ref={scroller} className="flex-1 overflow-y-auto" data-testid="live-scroll">
        {/* Zoom, not font size: the chart's own sizes (chords, headings, notes) keep their proportions. */}
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 pt-6 pb-[40vh]" style={{ zoom: textSize }}>
          {details.length > 0 ? <p className="text-xs text-muted-foreground lg:hidden">{details.join(" · ")}</p> : null}
          {song.notes.length > 0 ? (
            <div className="flex flex-col gap-1 rounded-md border-l-4 border-primary bg-muted px-3 py-2 text-sm">
              {song.notes.map((note, i) => (
                <p key={i} className={note.label ? "whitespace-pre-wrap text-muted-foreground" : "whitespace-pre-wrap"}>
                  {note.label ? <span className="font-medium">{note.label}: </span> : null}
                  {note.text}
                </p>
              ))}
            </div>
          ) : null}
          {chart ? <SongChart chart={chart} emptyText={t("sets.noChart")} /> : <p className="text-muted-foreground">{t("sets.hiddenSong")}</p>}
          {inSet ? <p className="mt-8 border-t pt-4 text-sm font-medium text-muted-foreground">{song.nextLabel}</p> : null}
        </div>
      </main>

      <footer className="flex shrink-0 items-center gap-1 border-t bg-card px-2 py-2 sm:gap-2 sm:px-4">
        {inSet ? (
          <IconButton label={t("sets.previousSong")} onClick={() => previous?.()} disabled={!previous}>
            <ChevronLeft />
          </IconButton>
        ) : null}

        <div className="flex items-center gap-1" role="group" aria-label={t("live.autoscroll")}>
          <IconButton label={t("live.slower")} onClick={() => changeSpeed(-1)} disabled={!chart || speed === SPEEDS[0]}>
            <Turtle />
          </IconButton>
          <button
            type="button"
            onClick={() => setPlaying(!playing)}
            disabled={!chart || seconds <= 0}
            aria-label={playing ? t("live.pause") : t("live.play")}
            aria-pressed={playing}
            className="flex h-10 items-center gap-1.5 rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50 [&_svg]:size-4"
          >
            {playing ? <Pause /> : <Play />}
            <span className="tabular-nums" data-testid="live-speed">
              {Math.round(speed * 100)}%
            </span>
          </button>
          <IconButton label={t("live.faster")} onClick={() => changeSpeed(1)} disabled={!chart || speed === SPEEDS.at(-1)}>
            <Rabbit />
          </IconButton>
        </div>

        <div className="hidden items-center gap-1 sm:flex">
          <IconButton label={t("live.smaller")} onClick={() => changeTextSize(-1)} disabled={textSize === TEXT_SIZES[0]}>
            <AArrowDown />
          </IconButton>
          <IconButton label={t("live.bigger")} onClick={() => changeTextSize(1)} disabled={textSize === TEXT_SIZES.at(-1)}>
            <AArrowUp />
          </IconButton>
        </div>

        <p className="hidden flex-1 text-center text-xs text-muted-foreground lg:block">{inSet ? t("live.keys") : t("live.keysAlone")}</p>

        {inSet ? (
          <button
            type="button"
            onClick={() => next?.()}
            disabled={!next}
            className="ml-auto flex h-10 min-w-0 items-center gap-1 rounded-md border px-3 text-sm font-medium hover:bg-accent hover:text-accent-foreground disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0"
            data-testid="live-next"
          >
            <span className="truncate">{song.nextLabel}</span>
            <ChevronRight />
          </button>
        ) : null}
      </footer>
    </div>
  );
}

const iconClass =
  "flex size-10 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-40 [&_svg]:size-5";

function IconButton({
  label,
  onClick,
  disabled,
  pressed,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  pressed?: boolean;
  children: ReactNode;
}) {
  return (
    <button type="button" className={iconClass} aria-label={label} title={label} aria-pressed={pressed} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  );
}

/** Keeps the screen on while the page is shown (where the browser can). */
function useWakeLock() {
  useEffect(() => {
    if (!("wakeLock" in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let active = true;
    const request = () => {
      if (document.visibilityState !== "visible") return;
      navigator.wakeLock
        .request("screen")
        .then((sentinel) => {
          if (active) lock = sentinel;
          else void sentinel.release();
        })
        .catch(() => {
          // Refused (battery saver, no permission): the screen may sleep.
        });
    };
    request();
    // The browser drops the lock when the page is hidden; take it again on return.
    document.addEventListener("visibilitychange", request);
    return () => {
      active = false;
      document.removeEventListener("visibilitychange", request);
      void lock?.release();
    };
  }, []);
}

function useFullScreen() {
  const [available, setAvailable] = useState(false);
  const [active, setActive] = useState(false);
  useEffect(() => {
    setAvailable(document.fullscreenEnabled);
    const onChange = () => setActive(!!document.fullscreenElement);
    onChange();
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);
  const toggle = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen().catch(() => {});
  };
  return { available, active, toggle };
}
