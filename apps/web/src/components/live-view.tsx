import { chartSeconds, structureOf, type RenderedChart, type StructureGroup } from "@songverse/core";
import { AArrowDown, AArrowUp, ArrowLeft, ChevronLeft, ChevronRight, Expand, Minus, Pause, Play, Plus, Rabbit, Shrink, Turtle } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode, type RefObject, type TouchEvent } from "react";
import { useTranslation } from "react-i18next";
import { CommandSearch } from "#/components/command-search";
import { MetronomeSongButton } from "#/components/metronome";
import { ModeSwitch } from "#/components/mode-switch";
import { OfflineBanner } from "#/components/offline-banner";
import { SongChart } from "#/components/song-chart";
import { SyncControl } from "#/components/sync-control";
import { SidebarTrigger } from "#/components/ui/sidebar";
import { cn } from "#/lib/utils";

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
  /** Its artists, under the title. */
  artist: string | null;
  /** The set it's played in, the header's only text; null for a song on its own. */
  setName: string | null;
  /** The set's ID, for Sync play (issue #13); null for a song on its own. */
  setId: string | null;
  /** The chart, moved `extraSteps` semitones more (the last-minute transpose); null when the player can't read the song. */
  chartFor: (extraSteps: number) => RenderedChart | null;
  /** Semitones from the song's own key before that (the arrangement's and the set's): the key's "+1". */
  keyShift: number;
  durationSeconds: number | null | undefined;
  arrangementName: string | null;
  /** Where it is in the player's songbooks: "JEM 855 · JEM3" (issue #59). */
  references: string[];
  notes: { label?: string; text: string }[];
  /** Back to wherever a song on its own was pulled up from (a set's song, say), beside the sidebar's button; a set's songs have the sidebar (issue #154). */
  exit?: { label: string; go: () => void };
  /** Played through (issue #153): its chart scrolled to 95% - or, when it fits the screen, moved on from to the next song. */
  onPlayed?: () => void;
  /** Going through a set; both null for a song on its own. */
  previous: (() => void) | null;
  next: (() => void) | null;
  /** "Next: …" or "End of the set"; null for a song on its own. */
  nextLabel: string | null;
}

/** How far down a chart is scrolled for its song to count as played (issue #153). */
const PLAYED_AT = 0.95;

/** Semitones as the smaller move: +1, -2, never +11. */
function shiftOf(steps: number): number {
  const up = ((steps % 12) + 12) % 12;
  return up > 6 ? up - 12 : up;
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

  // The last-minute transpose (issue #68): this song, here, until it's left.
  const [extraSteps, setExtraSteps] = useState(0);
  const chart = useMemo(() => song.chartFor(extraSteps), [song, extraSteps]);
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

  // Another song (the next, a swipe away): from its top, autoscroll off. The
  // router's scroll restoration puts the last song's position back on the
  // scroller as the page changes, so this runs again once it has.
  useEffect(() => {
    setPlaying(false);
    setExtraSteps(0);
    const toTop = () => scroller.current?.scrollTo({ top: 0 });
    toTop();
    const frame = requestAnimationFrame(toTop);
    return () => cancelAnimationFrame(frame);
  }, [song.id]);

  // Played through (issue #153): scrolled to 95% of the way down, once it's been seen higher up
  // (the router's scroll restoration can put the last song's position back for a moment).
  // (A new function on each render: kept in a ref, so the count starts again only with another song.)
  const onPlayed = useRef(song.onPlayed);
  onPlayed.current = song.onPlayed;
  const played = useRef(false);
  useEffect(() => {
    played.current = false;
    const element = scroller.current;
    if (!element) return;
    let seenHigher = false;
    const check = () => {
      const distance = element.scrollHeight - element.clientHeight;
      if (distance <= 8 || played.current) return;
      const through = element.scrollTop / distance;
      if (through < PLAYED_AT) seenHigher = true;
      else if (seenHigher) {
        played.current = true;
        onPlayed.current?.();
      }
    };
    element.addEventListener("scroll", check, { passive: true });
    return () => element.removeEventListener("scroll", check);
  }, [song.id]);
  // A chart that fits the screen has no end to scroll to: played once it's moved on from.
  const next = song.next
    ? () => {
        const element = scroller.current;
        if (element && element.scrollHeight - element.clientHeight <= 8 && !played.current) onPlayed.current?.();
        song.next?.();
      }
    : null;
  const { previous } = song;
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

  // Swiping left or right goes to the next or previous song (issue #67):
  // a quick, mostly sideways move of one finger; scrolling stays vertical.
  const swipe = useRef<{ x: number; y: number; at: number } | null>(null);
  const onTouchStart = (event: TouchEvent<HTMLElement>) => {
    const touch = event.touches[0];
    swipe.current = event.touches.length === 1 && touch ? { x: touch.clientX, y: touch.clientY, at: Date.now() } : null;
  };
  const onTouchEnd = (event: TouchEvent<HTMLElement>) => {
    const start = swipe.current;
    const touch = event.changedTouches[0];
    swipe.current = null;
    if (!start || !touch) return;
    const dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;
    if (Math.abs(dx) < 70 || Math.abs(dx) < Math.abs(dy) * 2 || Date.now() - start.at > 800) return;
    if (dx < 0) next?.();
    else previous?.();
  };

  const details = [
    ...song.references,
    chart?.capo ? t("player.capo", { capo: chart.capo }) : null,
    chart?.tempo ? `${chart.tempo} BPM` : null,
    song.arrangementName,
  ].filter(Boolean);
  const inSet = song.nextLabel !== null;
  const steps = useMemo(() => (chart ? structureOf(chart) : []), [chart]);
  const [current, pickPass] = useCurrentPass(scroller, steps, song.id);

  function goToPass(passId: string) {
    pickPass(passId);
    const element = scroller.current;
    const pass = element?.querySelector(`[data-pass="${CSS.escape(passId)}"]`);
    if (!element || !pass) return;
    element.scrollTo({ top: pass.getBoundingClientRect().top - element.getBoundingClientRect().top + element.scrollTop - 12, behavior: "smooth" });
  }

  return (
    <div className="flex h-dvh flex-col bg-background text-foreground" data-testid="live-view">
      {/* Always the same height; the song's own title is at the top of its chart (issue #68). */}
      <header className="flex h-14 shrink-0 items-center gap-2 border-b-2 border-b-primary px-2 sm:gap-3 sm:px-4">
        {/* The sidebar (issue #154): beside the song on a wider screen, a sheet on a phone. */}
        <SidebarTrigger className="size-10 text-muted-foreground [&_svg]:size-5" data-testid="live-sidebar" />
        {song.exit ? (
          <IconButton label={song.exit.label} onClick={song.exit.go}>
            <ArrowLeft />
          </IconButton>
        ) : null}
        <p className="min-w-0 flex-1 truncate text-sm font-medium text-muted-foreground" data-testid="live-set">
          {song.setName}
        </p>
        <OfflineBanner compact />
        {/* The song's tempo and time signature, one press (issue #2); the rest on the Metronome page. */}
        {song.setId ? <SyncControl setId={song.setId} compact /> : null}
        <MetronomeSongButton songId={song.id} tempo={chart?.tempo} timeSignature={chart?.timeSignature} />
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

      {steps.length > 0 ? <StructureBar steps={steps} current={current} onPick={goToPass} /> : null}

      <main ref={scroller} className="flex-1 overflow-y-auto" data-testid="live-scroll" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        {/* Zoom, not font size: the chart's own sizes (chords, headings, notes) keep their proportions. */}
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 pt-6 pb-[40vh]" style={{ zoom: textSize }}>
          <div className="flex items-start justify-between gap-4" data-testid="live-song-top">
            <div className="min-w-0">
              <h1 className="text-2xl leading-tight font-bold sm:text-3xl">{song.title}</h1>
              {song.artist ? <p className="text-base text-muted-foreground sm:text-lg">{song.artist}</p> : null}
              {details.length > 0 ? (
                <p className="mt-1 text-xs text-muted-foreground" data-testid="live-details">
                  {details.join(" · ")}
                </p>
              ) : null}
            </div>
            {chart?.key ? <KeyButton musicalKey={chart.key} shift={shiftOf(song.keyShift + extraSteps)} extraSteps={extraSteps} onTranspose={setExtraSteps} /> : null}
          </div>
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

/**
 * The pass being sung: the last one whose top has scrolled past the upper
 * quarter of the view (the first at the very top), following the scroll -
 * by hand or autoscroll.
 */
function useCurrentPass(
  scroller: RefObject<HTMLElement | null>,
  steps: { passId: string }[],
  songId: string,
): [string | null, (passId: string) => void] {
  const [current, setCurrent] = useState<string | null>(steps[0]?.passId ?? null);
  // A pass picked in the bar stays current while it's scrolled to: near the
  // end of a song it may never reach the top, where it would count as reached.
  const picked = useRef<{ passId: string; until: number } | null>(null);
  useEffect(() => {
    const element = scroller.current;
    if (!element) return;
    let frame = 0;
    const measure = () => {
      frame = 0;
      if (picked.current && Date.now() < picked.current.until) return;
      picked.current = null;
      const line = element.getBoundingClientRect().top + element.clientHeight * 0.25;
      let found: string | null = steps[0]?.passId ?? null;
      for (const pass of element.querySelectorAll<HTMLElement>("[data-pass]")) {
        if (pass.getBoundingClientRect().top <= line) found = pass.dataset.pass ?? found;
        else break;
      }
      setCurrent(found);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };
    measure();
    element.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      element.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(frame);
    };
  }, [scroller, steps, songId]);
  const pick = (passId: string) => {
    picked.current = { passId, until: Date.now() + 1000 };
    setCurrent(passId);
  };
  return [current, pick];
}

// A colour per kind of section, for Live's dark theme: filled once reached, outlined ahead.
const GROUP_STYLES: Record<StructureGroup, { filled: string; outlined: string }> = {
  edge: { filled: "bg-violet-500 text-white border-violet-500", outlined: "border-violet-400/70 text-violet-300" },
  verse: { filled: "bg-sky-500 text-white border-sky-500", outlined: "border-sky-400/70 text-sky-300" },
  chorus: { filled: "bg-amber-400 text-black border-amber-400", outlined: "border-amber-300/70 text-amber-200" },
  bridge: { filled: "bg-rose-500 text-white border-rose-500", outlined: "border-rose-400/70 text-rose-300" },
  instrumental: { filled: "bg-emerald-500 text-white border-emerald-500", outlined: "border-emerald-400/70 text-emerald-300" },
  other: { filled: "bg-zinc-500 text-white border-zinc-500", outlined: "border-zinc-400/70 text-zinc-300" },
};

/**
 * The song's structure (issue #68), fixed under the header: its passes in
 * order - V1 C V2 C B C - coloured by kind, the one being sung ringed, those
 * sung filled. Tapping one goes there.
 */
function StructureBar({ steps, current, onPick }: { steps: ReturnType<typeof structureOf>; current: string | null; onPick: (passId: string) => void }) {
  const { t } = useTranslation();
  const bar = useRef<HTMLDivElement>(null);
  const reached = Math.max(0, steps.findIndex((step) => step.passId === current));

  // The current one kept in view, on a long song on a phone.
  useEffect(() => {
    bar.current?.querySelector('[aria-current="step"]')?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [current]);

  return (
    <nav ref={bar} className="flex shrink-0 items-center gap-1.5 overflow-x-auto border-b px-2 py-2 sm:px-4" aria-label={t("live.structure")} data-testid="live-structure">
      {steps.map((step, index) => {
        const name = `${t(`chart.sections.${step.type}`)}${step.number ? ` ${step.number}` : ""}`;
        const style = GROUP_STYLES[step.group];
        const isCurrent = step.passId === current;
        return (
          <button
            key={step.passId}
            type="button"
            onClick={() => onPick(step.passId)}
            aria-label={t("live.goToPass", { name })}
            aria-current={isCurrent ? "step" : undefined}
            title={name}
            data-group={step.group}
            className={cn(
              "flex h-7 min-w-7 shrink-0 items-center justify-center rounded-full border px-1.5 text-xs font-semibold transition-colors",
              index <= reached ? style.filled : style.outlined,
              index < reached && "opacity-60",
              isCurrent && "ring-2 ring-foreground ring-offset-2 ring-offset-background",
            )}
          >
            {t(`live.short.${step.type}`)}
            {step.number ?? ""}
          </button>
        );
      })}
    </nav>
  );
}

/**
 * The key the song is played in, top right of it (issue #68): "G", with a
 * subtle "+1" when it's moved from the song's own. Tapping it transposes,
 * for now only: this song, here, until it's left.
 */
function KeyButton({ musicalKey, shift, extraSteps, onTranspose }: { musicalKey: string; shift: number; extraSteps: number; onTranspose: (steps: number) => void }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const shiftText = shift > 0 ? `+${shift}` : shift < 0 ? `−${-shift}` : "";

  // Closed by a tap anywhere else.
  useEffect(() => {
    if (!open) return;
    const onDown = (event: PointerEvent) => {
      if (!box.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  return (
    <div ref={box} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-label={shiftText ? t("live.keyShifted", { key: musicalKey, shift: shiftText }) : t("live.key", { key: musicalKey })}
        className="flex items-baseline gap-0.5 rounded-lg border px-3 py-1 hover:bg-accent"
        data-testid="live-key"
      >
        <span className="text-2xl font-bold sm:text-3xl">{musicalKey}</span>
        {shiftText ? <span className="text-sm text-muted-foreground">{shiftText}</span> : null}
      </button>
      {open ? (
        <div className="absolute top-full right-0 z-20 mt-2 flex w-64 flex-col gap-3 rounded-lg border bg-popover p-3 text-popover-foreground shadow-lg" data-testid="live-transpose">
          <p className="text-sm font-medium">{t("live.transposeNow")}</p>
          <div className="flex items-center justify-between gap-2">
            <button type="button" className={iconClass} onClick={() => onTranspose(extraSteps - 1)} aria-label={t("live.semitoneDown")}>
              <Minus />
            </button>
            <span className="text-2xl font-bold">{musicalKey}</span>
            <button type="button" className={iconClass} onClick={() => onTranspose(extraSteps + 1)} aria-label={t("live.semitoneUp")}>
              <Plus />
            </button>
          </div>
          {extraSteps !== 0 ? (
            <button type="button" className="rounded-md border px-3 py-1.5 text-sm hover:bg-accent" onClick={() => onTranspose(0)}>
              {t("live.resetKey")}
            </button>
          ) : null}
          <p className="text-xs text-muted-foreground">{t("live.transposeHint")}</p>
        </div>
      ) : null}
    </div>
  );
}
