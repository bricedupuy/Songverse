import { useRouter } from "@tanstack/react-router";
import type { StemPart } from "@songverse/core";
import {
  ChevronDown,
  ChevronUp,
  ClefBass,
  Drum,
  Ellipsis,
  Guitar,
  Headphones,
  Loader2,
  Metronome,
  MicVocal,
  Music,
  Pause,
  Piano,
  Play,
  UserRoundPlus,
  type LucideIcon,
} from "lucide-react";
import { createContext, useContext, useEffect, useId, useMemo, useState, type PointerEvent } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { Button } from "#/components/ui/button";
import { setMode } from "#/lib/mode";
import {
  dockStems,
  isAudible,
  pauseStems,
  playStems,
  seekStems,
  stemKey,
  toggleStemMute,
  toggleStemSolo,
  tracksOf,
  undockStems,
  useStems,
  type StemSong,
  type StemTrack,
} from "#/lib/stem-engine";
import { cn } from "#/lib/utils";

/** Where the dock goes: the bottom of the page's column, kept in view (see AppShell). */
export const StemDockSlot = createContext<HTMLElement | null>(null);

const EXPANDED_KEY = "songverse.stems.expanded";

const PART_ICONS: Record<StemPart, LucideIcon> = {
  VOCALS: MicVocal,
  BACKING_VOCALS: UserRoundPlus,
  DRUMS: Drum,
  BASS: ClefBass,
  GUITAR: Guitar,
  KEYS: Piano,
  OTHER: Ellipsis,
  CLICK: Metronome,
};

// Clear of the screen's rounded corners and the home indicator on a phone.
const EDGES = "pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] md:px-6";

function formatTime(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

function useTrackName() {
  const { t } = useTranslation();
  return (track: StemTrack) => `${t(`stems.parts.${track.part}`)}${track.number ? ` ${track.number}` : ""}`;
}

/**
 * A song's stems, docked at the bottom of its page in Practice (issue #64):
 * one row by default - play, and a round button per part to mute it -
 * expanded, a row per part with its waveform, mute and solo. The audio
 * lives in lib/stem-engine, so it plays on after the page is left.
 */
export function StemDock({ song }: { song: StemSong }) {
  const slot = useContext(StemDockSlot);
  const { t } = useTranslation();
  const engine = useStems();
  const nameOf = useTrackName();
  const key = stemKey(song);
  const active = engine.key === key;
  const tracks = active ? engine.tracks : tracksOf(song.stems);
  const playing = active && engine.playing;
  const loading = active && engine.status === "loading";
  const position = active ? engine.position : 0;
  const duration = active ? engine.duration : 0;
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    try {
      setExpanded(localStorage.getItem(EXPANDED_KEY) === "true");
    } catch {
      // Storage blocked: compact.
    }
  }, []);

  useEffect(() => {
    dockStems(song.songVersionId);
    return () => undockStems(song.songVersionId);
  }, [song.songVersionId]);

  function expand(next: boolean) {
    setExpanded(next);
    try {
      localStorage.setItem(EXPANDED_KEY, String(next));
    } catch {
      // Remembered for this page only.
    }
  }

  const play = (
    <Button
      type="button"
      size="icon"
      className="size-10 shrink-0 rounded-full"
      onClick={() => void (playing ? pauseStems() : playStems(song))}
      disabled={loading}
      aria-label={playing ? t("stems.pause") : t("stems.play")}
    >
      {loading ? <Loader2 className="animate-spin" /> : playing ? <Pause /> : <Play />}
    </Button>
  );
  const time = (
    <span className="shrink-0 text-xs tabular-nums text-muted-foreground" data-testid="stem-time">
      {formatTime(position)} / {formatTime(duration)}
    </span>
  );
  const status =
    loading ? (
      <p className="text-xs text-muted-foreground" role="status">
        {t("stems.loading", { done: engine.loaded, count: tracks.length })}
      </p>
    ) : active && engine.status === "error" ? (
      <p className="text-xs text-destructive" role="alert">
        {t("stems.loadFailed")}
      </p>
    ) : null;

  const dock = (
    <section
      className="relative border-t bg-background shadow-[0_-4px_12px_-8px_rgb(0_0_0/0.3)]"
      aria-label={t("stems.title")}
      data-testid="stem-player"
      data-state={playing ? "playing" : active ? engine.status : "idle"}
      data-view={expanded ? "expanded" : "compact"}
    >
      {/* How far through, along the top edge. */}
      <div className="absolute inset-x-0 top-0 h-0.5 bg-muted" aria-hidden>
        <div className="h-full bg-primary" style={{ width: duration ? `${(position / duration) * 100}%` : "0%" }} />
      </div>
      {expanded ? (
        <div className={cn("mx-auto flex w-full max-w-7xl flex-col gap-2 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]", EDGES)}>
          <div className="flex items-center gap-3">
            {play}
            {time}
            <input
              type="range"
              min={0}
              max={duration || 0}
              step={0.1}
              value={Math.min(position, duration)}
              disabled={!active || engine.status !== "ready"}
              onChange={(event) => seekStems(Number(event.target.value))}
              aria-label={t("stems.position")}
              className="min-w-0 flex-1 accent-primary"
            />
            <Button type="button" variant="ghost" size="icon" className="shrink-0" onClick={() => expand(false)} aria-label={t("stems.minimize")}>
              <ChevronDown />
            </Button>
          </div>
          {status}
          <ul className="-mx-1.5 flex max-h-[45vh] flex-col divide-y overflow-y-auto px-1.5">
            {tracks.map((track) => {
              const name = nameOf(track);
              const on = isAudible(engine, track.id);
              return (
                <li key={track.id} className="flex items-center gap-2 py-1.5 sm:gap-3" data-testid="stem-track" data-part={track.part} data-audible={String(on)}>
                  <PartButton track={track} name={name} on={on} muted={engine.muted.has(track.id)} soloed={engine.soloed.has(track.id)} soloing={engine.soloed.size > 0} />
                  <span className={cn("w-20 shrink-0 min-w-0 sm:w-36", !on && "opacity-50")}>
                    <span className="block truncate text-sm font-medium">{name}</span>
                    <span className="hidden truncate text-xs text-muted-foreground sm:block">{track.filename}</span>
                  </span>
                  {track.failed ? (
                    <span className="min-w-0 flex-1 text-xs text-destructive">{t("stems.failed", { name: track.filename })}</span>
                  ) : (
                    <Waveform peaks={track.peaks} progress={duration ? position / duration : 0} dim={!on} onSeek={active && engine.status === "ready" ? (at) => seekStems(at * duration) : undefined} />
                  )}
                  <Button
                    type="button"
                    size="icon"
                    className="shrink-0"
                    variant={engine.soloed.has(track.id) ? "secondary" : "ghost"}
                    aria-pressed={engine.soloed.has(track.id)}
                    aria-label={t("stems.solo", { part: name })}
                    onClick={() => toggleStemSolo(track.id)}
                  >
                    <Headphones />
                  </Button>
                </li>
              );
            })}
          </ul>
        </div>
      ) : (
        <div className={cn("mx-auto flex w-full max-w-7xl items-center gap-2 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:pb-2", EDGES)}>
          {play}
          <div className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto px-1.5 py-1">
            {tracks.map((track) => (
              <PartButton key={track.id} track={track} name={nameOf(track)} on={isAudible(engine, track.id)} muted={engine.muted.has(track.id)} soloed={engine.soloed.has(track.id)} soloing={engine.soloed.size > 0} chip />
            ))}
          </div>
          {status ? <span className="hidden sm:block">{status}</span> : duration ? <span className="hidden sm:block">{time}</span> : null}
          <Button type="button" variant="ghost" size="icon" className="shrink-0" onClick={() => expand(true)} aria-label={t("stems.expand")}>
            <ChevronUp />
          </Button>
        </div>
      )}
    </section>
  );

  return slot ? createPortal(dock, slot) : null;
}

/**
 * A part's round button, its instrument's icon: tap to mute it, again to
 * bring it back. Filled while heard, hollow when muted, ringed when soloed.
 * While some parts are soloed, a tap moves this one in or out of the solo
 * instead (muting a part that isn't heard anyway would change nothing).
 */
function PartButton({
  track,
  name,
  on,
  muted,
  soloed,
  soloing,
  chip = false,
}: {
  track: StemTrack;
  name: string;
  on: boolean;
  muted: boolean;
  soloed: boolean;
  /** Some part is soloed. */
  soloing: boolean;
  chip?: boolean;
}) {
  const { t } = useTranslation();
  const Icon = PART_ICONS[track.part];
  return (
    <button
      type="button"
      title={name}
      aria-label={soloed ? t("stems.unsolo", { part: name }) : soloing ? t("stems.solo", { part: name }) : t("stems.mute", { part: name })}
      aria-pressed={soloing ? soloed : muted}
      onClick={() => (soloing ? toggleStemSolo(track.id) : toggleStemMute(track.id))}
      data-testid={chip ? "stem-chip" : "stem-part"}
      data-part={track.part}
      data-audible={String(on)}
      className={cn(
        "relative flex size-9 shrink-0 items-center justify-center rounded-full border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
        on ? "border-primary bg-primary text-primary-foreground" : "border-dashed border-muted-foreground/50 text-muted-foreground",
        soloed && "ring-2 ring-primary ring-offset-2 ring-offset-background",
        track.failed && "opacity-40",
      )}
    >
      <Icon className="size-4" aria-hidden />
      {track.number ? (
        <span className="absolute -right-1 -bottom-1 flex size-4 items-center justify-center rounded-full border bg-background text-[10px] font-semibold text-foreground" aria-hidden>
          {track.number}
        </span>
      ) : null}
    </button>
  );
}

/** A part's waveform, the part played in the accent colour; a click or a drag seeks. */
function Waveform({ peaks, progress, dim, onSeek }: { peaks: number[] | null; progress: number; dim: boolean; onSeek?: (at: number) => void }) {
  const clip = useId();
  const path = useMemo(
    () =>
      peaks
        ?.map((peak, i) => {
          const height = Math.max(2, peak * 92);
          return `M${i} ${(100 - height) / 2}h0.7v${height}h-0.7z`;
        })
        .join("") ?? "",
    [peaks],
  );
  const width = peaks?.length ?? 1;

  function seek(event: PointerEvent<SVGSVGElement>) {
    if (!onSeek || (event.type === "pointermove" && event.buttons !== 1)) return;
    const box = event.currentTarget.getBoundingClientRect();
    onSeek(Math.min(1, Math.max(0, (event.clientX - box.left) / box.width)));
  }

  if (!peaks) return <div className="h-px min-w-0 flex-1 bg-border" aria-hidden />;
  return (
    <svg
      viewBox={`0 0 ${width} 100`}
      preserveAspectRatio="none"
      className={cn("h-8 min-w-0 flex-1 touch-none", onSeek && "cursor-pointer", dim && "opacity-40")}
      onPointerDown={seek}
      onPointerMove={seek}
      aria-hidden
      data-testid="stem-waveform"
    >
      <defs>
        <clipPath id={clip}>
          <rect x={0} y={0} width={progress * width} height={100} />
        </clipPath>
      </defs>
      <path d={path} className="fill-muted-foreground/35" />
      <path d={path} className="fill-primary" clipPath={`url(#${clip})`} />
    </svg>
  );
}

/**
 * While stems play and their song's dock isn't on screen - another page,
 * another mode - a small button back to it, and one to pause.
 */
export function StemReturnButton() {
  const { t } = useTranslation();
  const engine = useStems();
  const router = useRouter();
  if (!engine.playing || engine.docked === engine.songVersionId) return null;
  return (
    <div
      className="fixed right-4 bottom-4 z-50 flex items-center gap-1 rounded-full border bg-background p-1 shadow-lg"
      role="region"
      aria-label={t("stems.playingElsewhere")}
      data-testid="stem-return"
    >
      <button
        type="button"
        className="flex min-w-0 items-center gap-2 rounded-full py-1.5 pr-3 pl-2 text-sm font-medium hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        onClick={() => {
          setMode("practice");
          void router.navigate({ href: engine.returnTo });
        }}
        aria-label={t("stems.backToSong", { title: engine.title })}
      >
        <span className="flex size-7 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <Music className="size-4 animate-pulse" />
        </span>
        <span className="max-w-40 truncate">{engine.title}</span>
      </button>
      <Button type="button" variant="ghost" size="icon" className="rounded-full" onClick={pauseStems} aria-label={t("stems.pause")}>
        <Pause />
      </Button>
    </div>
  );
}
