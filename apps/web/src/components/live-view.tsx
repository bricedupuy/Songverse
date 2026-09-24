import { chartSeconds, type SetlistSongView } from "@songverse/core";
import { Link, useNavigate } from "@tanstack/react-router";
import { AArrowDown, AArrowUp, ChevronLeft, ChevronRight, Expand, Pause, Play, Rabbit, Shrink, Turtle, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { ModeSwitch } from "#/components/mode-switch";
import { renderPlayerChart } from "#/components/player-chart";
import { SongChart } from "#/components/song-chart";
import { setlistTitle } from "#/lib/setlists";
import { cn } from "#/lib/utils";

const TEXT_SIZE_KEY = "songverse.liveTextSize";
const TEXT_SIZES = [1, 1.25, 1.5, 1.75, 2, 2.5, 3];
const DEFAULT_TEXT_SIZE = 1.5;
const PHONE_TEXT_SIZE = 1.25;
const SPEEDS = [0.5, 0.6, 0.7, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2];

/**
 * A song of a set, full screen, to play from (Live mode, issues #29 and #47): the
 * chart big, as this player reads it, what's next, and autoscroll paced by
 * the tempo. Keeps the screen awake. Keys (and page-turner pedals, which
 * send them): Space starts and pauses autoscroll, the up and down arrows
 * and Page Up/Down scroll, the left and right arrows change song.
 */
export function LiveView({ view }: { view: SetlistSongView }) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { set, item, song } = view;
  const scroller = useRef<HTMLElement>(null);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [textSize, setTextSize] = useState(DEFAULT_TEXT_SIZE);
  const fullScreen = useFullScreen();
  useWakeLock();

  const chart = useMemo(() => (song ? renderPlayerChart(view) : null), [song, view]);
  const seconds = chart && song ? chartSeconds(chart, song.document.defaults.durationSeconds) : 0;

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
  }, [item.id]);

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

  const goTo = useCallback(
    (itemId: string | null) => {
      if (itemId) void navigate({ to: "/sets/$setlistId/live/$itemId", params: { setlistId: set.id, itemId } });
    },
    [navigate, set.id],
  );

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.altKey || event.ctrlKey || event.metaKey || event.defaultPrevented) return;
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
          goTo(view.nextItemId);
          break;
        case "ArrowLeft":
          goTo(view.previousItemId);
          break;
        default:
          return;
      }
      event.preventDefault();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [goTo, view.nextItemId, view.previousItemId]);

  const tempo = chart?.tempo ?? song?.tempo;
  const details = [
    chart?.key,
    chart?.capo ? t("player.capo", { capo: chart.capo }) : null,
    tempo ? `${tempo} BPM` : null,
    view.arrangement ? view.arrangement.name : null,
  ].filter(Boolean);

  return (
    <div className="flex h-dvh flex-col bg-background text-foreground" data-testid="live-view">
      <header className="flex shrink-0 items-center gap-2 border-b-2 border-b-primary px-2 py-2 sm:gap-3 sm:px-4">
        <IconLink to="/sets/$setlistId" params={{ setlistId: set.id }} label={t("live.backToSet")}>
          <X />
        </IconLink>
        <div className="flex min-w-0 flex-1 flex-col">
          <p className="truncate text-xs text-muted-foreground">
            {setlistTitle(set, t, i18n.language)} · {t("live.position", { position: item.position + 1, count: set.itemCount })}
          </p>
          <h1 className="truncate text-lg font-semibold sm:text-xl">{song?.title ?? t("sets.hiddenSong")}</h1>
        </div>
        {details.length > 0 ? (
          <p className="hidden shrink-0 text-sm font-medium text-muted-foreground md:block" data-testid="live-details">
            {details.join(" · ")}
          </p>
        ) : null}
        {fullScreen.available ? (
          <IconButton label={t("live.fullScreen")} pressed={fullScreen.active} onClick={fullScreen.toggle}>
            {fullScreen.active ? <Shrink /> : <Expand />}
          </IconButton>
        ) : null}
        <ModeSwitch />
      </header>

      <main ref={scroller} className="flex-1 overflow-y-auto" data-testid="live-scroll">
        {/* Zoom, not font size: the chart's own sizes (chords, headings, notes) keep their proportions. */}
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 pt-6 pb-[40vh]" style={{ zoom: textSize }}>
          {details.length > 0 ? <p className="text-xs text-muted-foreground md:hidden">{details.join(" · ")}</p> : null}
          {item.notes || view.myNote ? (
            <div className="flex flex-col gap-1 rounded-md border-l-4 border-primary bg-muted px-3 py-2 text-sm">
              {item.notes ? <p className="whitespace-pre-wrap">{item.notes}</p> : null}
              {view.myNote ? (
                <p className="whitespace-pre-wrap text-muted-foreground">
                  <span className="font-medium">{t("sets.myNotes")}:</span> {view.myNote}
                </p>
              ) : null}
            </div>
          ) : null}
          {chart ? <SongChart chart={chart} emptyText={t("sets.noChart")} /> : <p className="text-muted-foreground">{t("sets.hiddenSong")}</p>}
          <p className="mt-8 border-t pt-4 text-sm font-medium text-muted-foreground">
            {view.nextItemId ? (view.nextTitle ? t("live.nextUp", { title: view.nextTitle }) : t("live.nextHidden")) : t("live.endOfSet")}
          </p>
        </div>
      </main>

      <footer className="flex shrink-0 items-center gap-1 border-t bg-card px-2 py-2 sm:gap-2 sm:px-4">
        <IconLink
          to="/sets/$setlistId/live/$itemId"
          params={{ setlistId: set.id, itemId: view.previousItemId ?? item.id }}
          label={t("sets.previousSong")}
          disabled={!view.previousItemId}
        >
          <ChevronLeft />
        </IconLink>

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

        <p className="hidden flex-1 text-center text-xs text-muted-foreground lg:block">{t("live.keys")}</p>

        <Link
          to="/sets/$setlistId/live/$itemId"
          params={{ setlistId: set.id, itemId: view.nextItemId ?? item.id }}
          disabled={!view.nextItemId}
          className={cn(
            "ml-auto flex h-10 min-w-0 items-center gap-1 rounded-md border px-3 text-sm font-medium hover:bg-accent hover:text-accent-foreground [&_svg]:size-4 [&_svg]:shrink-0",
            !view.nextItemId && "pointer-events-none opacity-50",
          )}
          data-testid="live-next"
        >
          <span className="truncate">
            {view.nextItemId ? (view.nextTitle ? t("live.nextUp", { title: view.nextTitle }) : t("live.nextHidden")) : t("live.endOfSet")}
          </span>
          <ChevronRight />
        </Link>
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

function IconLink({
  to,
  params,
  label,
  disabled,
  children,
}: {
  to: "/sets/$setlistId" | "/sets/$setlistId/live/$itemId";
  params: { setlistId: string; itemId?: string };
  label: string;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <Link
      to={to}
      params={params as never}
      aria-label={label}
      title={label}
      disabled={disabled}
      className={cn(iconClass, disabled && "pointer-events-none opacity-40")}
    >
      {children}
    </Link>
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
