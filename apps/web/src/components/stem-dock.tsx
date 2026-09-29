import { useRouter } from "@tanstack/react-router";
import { formatDuration, type StemPart } from "@songverse/core";
import {
  AudioLines,
  ChevronDown,
  ChevronUp,
  ClefBass,
  Drum,
  Ellipsis,
  Guitar,
  Headphones,
  Loader2,
  Metronome,
  Mic,
  MicVocal,
  Minus,
  Plus,
  Music,
  Pause,
  Piano,
  Play,
  UserRoundPlus,
  type LucideIcon,
} from "lucide-react";
import { createContext, useContext, useEffect, useId, useMemo, useState, type CSSProperties, type PointerEvent } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { harmonyLetter, multitracksOf, semitonesBetween, transposeKey, transposesPart } from "@songverse/core";
import { NEW_TARGET, RecorderDialog } from "#/components/recorder-dialog";
import { Button } from "#/components/ui/button";
import { setMode } from "#/lib/mode";
import { useMultitrackName } from "#/lib/multitrack-name";
import { setRecordingClick, useRecordingClick } from "#/lib/recording-click";
import { unlockSyncAudio } from "#/lib/sync-client";
import {
  chooseMultitrack,
  chooseStemTranspose,
  dockStems,
  setStemsTranspose,
  useChosenTranspose,
  isAudible,
  pauseStems,
  playStems,
  prefetchStems,
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
  // Sung harmonies (issue #131): a microphone, with the voice's letter on it.
  HARMONY_SOPRANO: Mic,
  HARMONY_ALTO: Mic,
  HARMONY_TENOR: Mic,
  HARMONY_BASS: Mic,
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

function useTrackName() {
  const { t } = useTranslation();
  return (track: StemTrack) => track.partName || (track.part ? `${t(`stems.parts.${track.part}`)}${track.number ? ` ${track.number}` : ""}` : t("stems.fullMix"));
}

/**
 * A song's stems, docked at the bottom of its page in Practice (issue #64):
 * one row by default - play, and a round button per part to mute it -
 * expanded, a row per part with its waveform, mute and solo. The audio
 * lives in lib/stem-engine, so it plays on after the page is left.
 */
export function StemDock({ song: page }: { song: StemSong }) {
  const slot = useContext(StemDockSlot);
  const { t } = useTranslation();
  const engine = useStems();
  // Transposed (issue #129): as chosen for the song (in this set), else to the key the page plays it in.
  const transposeStore = page.choiceKey ?? page.songVersionId;
  const chosenTranspose = useChosenTranspose(transposeStore);
  const recordedKey = page.stems[0]?.recordingKey ?? page.songKey ?? null;
  const defaultSteps = recordedKey && page.targetKey ? (semitonesBetween(recordedKey, page.targetKey) ?? 0) : 0;
  const steps = chosenTranspose?.steps ?? defaultSteps;
  const transposeAll = chosenTranspose?.all ?? false;
  const song: StemSong = { ...page, transpose: steps, transposeAll };
  const nameOf = useTrackName();
  const key = stemKey(song);
  const active = engine.key === key;
  const tracks = active ? engine.tracks : tracksOf(song.stems);
  // A song without stems: its whole recording (issue #66).
  const whole = tracks.length === 1 && tracks[0]?.part === null;
  const playing = active && engine.playing;
  const loading = active && engine.status === "loading";
  const position = active ? engine.position : 0;
  const duration = active ? engine.duration : 0;
  const [expanded, setExpanded] = useState(false);
  // Following Sync play's leader (issue #100): play, pause and seek are theirs.
  const following = active ? engine.following : null;
  const click = useRecordingClick();
  // What the stems were recorded in (#65), when it isn't the song's; they share it.
  const recording = song.stems[0];
  const recorded = [recording?.recordingKey, recording?.recordingTempo ? `${recording.recordingTempo} BPM` : null, recording?.recordingTimeSignature].filter(Boolean).join(" · ");
  // The song's other multitracks (issue #123), to switch to; not while following the leader's.
  const multitracks = song.multitracks ?? [];
  const multitrackName = useMultitrackName();
  const picker =
    multitracks.length > 1 && !following ? (
      <select
        className="h-8 max-w-40 min-w-0 shrink rounded-md border bg-background px-2 text-sm"
        value={song.multitrackId ?? ""}
        onChange={(event) => {
          if (playing) pauseStems();
          chooseMultitrack(song.choiceKey ?? song.songVersionId, event.target.value || null);
        }}
        aria-label={t("stems.multitrack")}
        data-testid="stem-multitrack"
      >
        {multitracks.map((multitrack, index) => (
          <option key={multitrack.id ?? ""} value={multitrack.id ?? ""}>
            {multitrackName(multitrack, index)}
          </option>
        ))}
      </select>
    ) : null;
  // A transposition chosen while it's loaded is heard now; following, the leader's is.
  useEffect(() => {
    if (active && !following) void setStemsTranspose(steps, transposeAll);
  }, [active, following, steps, transposeAll]);
  const heardSteps = following && active ? engine.transpose : steps;
  const heardAll = following && active ? engine.transposeAll : transposeAll;
  const signed = (value: number) => (value > 0 ? `+${value}` : `−${Math.abs(value)}`);
  const transposedKey = recordedKey ? transposeKey(recordedKey, heardSteps) : null;
  const transposeLabel = heardSteps === 0 ? (recordedKey ?? t("stems.transposeNone")) : transposedKey ? `${transposedKey} (${signed(heardSteps)})` : signed(heardSteps);
  const changeTranspose = (next: number, all = transposeAll) =>
    chooseStemTranspose(transposeStore, next === defaultSteps && !all ? undefined : { steps: Math.max(-6, Math.min(6, next)), all });
  const hasUnpitched = tracks.some((track) => !transposesPart(track.part));
  const transposeControl = (
    <div className="flex shrink-0 items-center" role="group" aria-label={t("stems.transpose")} data-testid="stem-transpose" data-steps={heardSteps}>
      <Button type="button" variant="ghost" size="icon" className="size-8" disabled={!!following || steps <= -6} onClick={() => changeTranspose(steps - 1)} aria-label={t("stems.transposeDown")}>
        <Minus />
      </Button>
      <span className={cn("min-w-12 text-center text-xs tabular-nums", heardSteps !== 0 && "font-semibold text-primary")} title={t("stems.transposeTitle")} data-testid="stem-transpose-label">
        {transposeLabel}
      </span>
      <Button type="button" variant="ghost" size="icon" className="size-8" disabled={!!following || steps >= 6} onClick={() => changeTranspose(steps + 1)} aria-label={t("stems.transposeUp")}>
        <Plus />
      </Button>
      {hasUnpitched && heardSteps !== 0 ? (
        <Button
          type="button"
          variant={heardAll ? "secondary" : "ghost"}
          size="icon"
          className="size-8"
          disabled={!!following}
          aria-pressed={heardAll}
          onClick={() => changeTranspose(steps, !transposeAll)}
          aria-label={t("stems.transposeAll")}
          title={t("stems.transposeAll")}
          data-testid="stem-transpose-all"
        >
          <Drum />
        </Button>
      ) : null}
    </div>
  );

  // Recording a part (issue #127), into the multitrack playing; not while following the leader.
  const [recorderOpen, setRecorderOpen] = useState(false);
  const recordButton =
    song.record && !following ? (
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="shrink-0"
        onClick={() => setRecorderOpen(true)}
        aria-label={t("recorder.recordPart")}
        title={t("recorder.recordPart")}
        data-testid="stem-record"
      >
        <Mic />
      </Button>
    ) : null;
  const recorder =
    recorderOpen && song.record ? (
      <RecorderDialog
        songVersionId={song.songVersionId}
        songTitle={song.title}
        multitracks={multitracksOf(song.record.attachments)}
        target={song.stems[0] && (song.stems[0].stemPart !== null || song.stems[0].multitrackId) ? (song.multitrackId ?? "") : NEW_TARGET}
        songTempo={song.tempo ?? null}
        songTimeSignature={song.timeSignature ? `${song.timeSignature.numerator}/${song.timeSignature.denominator}` : ""}
        songKey={song.record.songKey ?? ""}
        setlist={song.record.setlist}
        onClose={() => setRecorderOpen(false)}
        onSaved={song.record.onSaved}
      />
    ) : null;

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

  // Downloaded as the page opens in Practice, so Play is usually instant.
  useEffect(() => {
    prefetchStems(song);
    // Once per set of stems (`key`); `song` is a new object on every render.
  }, [key]);

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
      className={cn("size-10 shrink-0 rounded-full", engine.following && engine.audioBlocked && "animate-pulse ring-2 ring-amber-500")}
      onClick={() => (engine.following ? unlockSyncAudio() : void (playing ? pauseStems() : playStems(song)))}
      disabled={loading || (!!engine.following && !engine.audioBlocked)}
      aria-label={engine.following ? (engine.audioBlocked ? t("sync.tapToHear") : t("sync.followingShort", { name: engine.following })) : playing ? t("stems.pause") : t("stems.play")}
      title={engine.following ? t("sync.followingShort", { name: engine.following }) : undefined}
      data-testid="stem-play"
    >
      {loading ? <Loader2 className="animate-spin" /> : playing ? <Pause /> : <Play />}
    </Button>
  );
  // The metronome with the recording (issue #100): its tempo, its first beat.
  const beat = active ? engine.beat : null;
  const clickButton = following ? null : (
    <Button
      type="button"
      variant={click ? "secondary" : "ghost"}
      size="icon"
      className="shrink-0"
      aria-pressed={click}
      disabled={!beat && !click}
      onClick={() => setRecordingClick(!click)}
      aria-label={t("stems.clickWith")}
      title={beat ? t("stems.clickWithAt", { tempo: beat.tempo }) : t("stems.clickWithNoTempo")}
      data-testid="stem-click"
    >
      <Metronome />
    </Button>
  );
  const time = (
    <span className="shrink-0 text-xs tabular-nums text-muted-foreground" data-testid="stem-time">
      {formatDuration(position)} / {formatDuration(duration)}
    </span>
  );
  const status =
    loading ? (
      <p className="text-xs text-muted-foreground" role="status">
        {t("stems.loading", { percent: Math.round(engine.downloaded * 100) })}
      </p>
    ) : active && engine.transposeFailed ? (
      <p className="text-xs text-destructive" role="alert">
        {t("stems.transposeFailed")}
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
      {loading ? (
        <div
          className="absolute inset-x-0 top-0 h-0.5 bg-muted"
          role="progressbar"
          aria-label={t("stems.loading", { percent: Math.round(engine.downloaded * 100) })}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(engine.downloaded * 100)}
          data-testid="stem-download"
        >
          <div className="h-full bg-muted-foreground/60 transition-[width]" style={{ width: `${engine.downloaded * 100}%` }} />
        </div>
      ) : (
        // The playhead: the line along the top edge, in both views - click or drag it to go there (arrow keys too).
        <input
          type="range"
          min={0}
          max={duration || 0}
          step={0.1}
          value={Math.min(position, duration)}
          disabled={!active || engine.status !== "ready" || !!following}
          onChange={(event) => seekStems(Number(event.target.value))}
          aria-label={t("stems.position")}
          aria-valuetext={`${formatDuration(position)} / ${formatDuration(duration)}`}
          className="stem-playhead"
          style={{ "--progress": duration ? `${(position / duration) * 100}%` : "0%" } as CSSProperties}
          data-testid="stem-playhead"
        />
      )}
      {expanded ? (
        <div className={cn("mx-auto flex w-full max-w-7xl flex-col gap-2 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]", EDGES)}>
          <div className="flex items-center gap-3">
            {play}
            {time}
            <span className="min-w-0 flex-1" />
            {picker}
            {transposeControl}
            {recordButton}
            {clickButton}
            <Button type="button" variant="ghost" size="icon" className="shrink-0" onClick={() => expand(false)} aria-label={t("stems.minimize")}>
              <ChevronDown />
            </Button>
          </div>
          {status}
          {recorded ? (
            <p className="text-xs text-muted-foreground" data-testid="stem-recorded">
              {t("stems.recordedIn", { details: recorded })}
            </p>
          ) : null}
          <ul className="-mx-1.5 flex max-h-[45vh] flex-col divide-y overflow-y-auto px-1.5">
            {tracks.map((track) => {
              const name = nameOf(track);
              const on = isAudible(engine, track.id);
              return (
                <li key={track.id} className="flex items-center gap-2 py-1.5 sm:gap-3" data-testid="stem-track" data-part={track.part ?? "MIX"} data-audible={String(on)}>
                  <PartButton track={track} name={name} on={on} muted={engine.muted.has(track.id)} soloed={engine.soloed.has(track.id)} soloing={engine.soloed.size > 0} />
                  <span className={cn("w-20 shrink-0 min-w-0 sm:w-36", !on && "opacity-50")}>
                    <span className="block truncate text-sm font-medium">{name}</span>
                    <span className="hidden truncate text-xs text-muted-foreground sm:block">
                      {heardSteps !== 0 && !transposesPart(track.part, heardAll) ? t("stems.notTransposed") : track.by ? t("stems.recordedBy", { name: track.by }) : track.filename}
                    </span>
                  </span>
                  {track.failed ? (
                    <span className="min-w-0 flex-1 text-xs text-destructive">{t("stems.failed", { name: track.filename })}</span>
                  ) : (
                    <Waveform peaks={track.peaks} progress={duration ? position / duration : 0} span={duration ? Math.min(1, track.length / duration) : 1} dim={!on} onSeek={active && engine.status === "ready" && !following ? (at) => seekStems(at * duration) : undefined} />
                  )}
                  {/* A whole recording has nothing to solo against. */}
                  {whole ? null : (
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
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      ) : (
        <div className={cn("mx-auto flex w-full max-w-7xl items-center gap-2 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:pb-2", EDGES)}>
          {play}
          <div className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto px-1.5 py-1">
            {whole ? (
              <span className="flex min-w-0 items-center gap-2 text-sm" data-testid="stem-recording-name">
                <AudioLines className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                <span className="truncate">{tracks[0]?.filename}</span>
              </span>
            ) : (
              tracks.map((track) => (
                <PartButton key={track.id} track={track} name={nameOf(track)} on={isAudible(engine, track.id)} muted={engine.muted.has(track.id)} soloed={engine.soloed.has(track.id)} soloing={engine.soloed.size > 0} chip />
              ))
            )}
          </div>
          {status ? <span className="hidden sm:block">{status}</span> : duration ? <span className="hidden sm:block">{time}</span> : null}
          {picker ? <span className="hidden sm:block">{picker}</span> : null}
          {heardSteps !== 0 ? (
            <span className="shrink-0 rounded-md bg-muted px-1.5 py-0.5 text-xs font-semibold tabular-nums text-primary" title={t("stems.transposeTitle")} data-testid="stem-transpose-badge">
              {signed(heardSteps)}
            </span>
          ) : null}
          {clickButton}
          <Button type="button" variant="ghost" size="icon" className="shrink-0" onClick={() => expand(true)} aria-label={t("stems.expand")}>
            <ChevronUp />
          </Button>
        </div>
      )}
    </section>
  );

  return slot ? (
    <>
      {createPortal(dock, slot)}
      {recorder}
    </>
  ) : null;
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
  const Icon = track.part ? PART_ICONS[track.part] : AudioLines;
  // A harmony's voice (S, A, T, B), or which of two of a part.
  const badge = harmonyLetter(track.part) ?? (track.number || null);
  return (
    <button
      type="button"
      title={track.by ? `${name} · ${track.by}` : name}
      aria-label={soloed ? t("stems.unsolo", { part: name }) : soloing ? t("stems.solo", { part: name }) : t("stems.mute", { part: name })}
      aria-pressed={soloing ? soloed : muted}
      onClick={() => (soloing ? toggleStemSolo(track.id) : toggleStemMute(track.id))}
      data-testid={chip ? "stem-chip" : "stem-part"}
      data-part={track.part ?? "MIX"}
      data-audible={String(on)}
      className={cn(
        "relative flex size-9 shrink-0 items-center justify-center rounded-full border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
        on ? "border-primary bg-primary text-primary-foreground" : "border-dashed border-muted-foreground/50 text-muted-foreground",
        soloed && "ring-2 ring-primary ring-offset-2 ring-offset-background",
        track.failed && "opacity-40",
      )}
    >
      <Icon className="size-4" aria-hidden />
      {badge ? (
        <span className="absolute -right-1 -bottom-1 flex size-4 items-center justify-center rounded-full border bg-background text-[10px] font-semibold text-foreground" aria-hidden>
          {badge}
        </span>
      ) : null}
    </button>
  );
}

/**
 * A part's waveform, the part played in the accent colour; a click or a
 * drag seeks. Drawn as long as the part is, against the longest (`span`,
 * 0-1): a take shorter than the rest isn't stretched to look like it lasts.
 */
function Waveform({ peaks, progress, span, dim, onSeek }: { peaks: number[] | null; progress: number; span: number; dim: boolean; onSeek?: (at: number) => void }) {
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

  function seek(event: PointerEvent<HTMLDivElement>) {
    if (!onSeek || (event.type === "pointermove" && event.buttons !== 1)) return;
    const box = event.currentTarget.getBoundingClientRect();
    onSeek(Math.min(1, Math.max(0, (event.clientX - box.left) / box.width)));
  }

  if (!peaks) return <div className="h-px min-w-0 flex-1 bg-border" aria-hidden />;
  return (
    <div
      className={cn("relative flex h-8 min-w-0 flex-1 items-center touch-none", onSeek && "cursor-pointer", dim && "opacity-40")}
      onPointerDown={seek}
      onPointerMove={seek}
      aria-hidden
    >
      {/* After its end: nothing, a line. */}
      <div className="absolute inset-x-0 top-1/2 h-px bg-border" />
      <svg
        viewBox={`0 0 ${width} 100`}
        preserveAspectRatio="none"
        className="relative h-8 shrink-0"
        style={{ width: `${span * 100}%` }}
        data-testid="stem-waveform"
        data-span={span.toFixed(3)}
      >
        <defs>
          <clipPath id={clip}>
            <rect x={0} y={0} width={Math.min(1, span ? progress / span : 0) * width} height={100} />
          </clipPath>
        </defs>
        <path d={path} className="fill-muted-foreground/35" />
        <path d={path} className="fill-primary" clipPath={`url(#${clip})`} />
      </svg>
    </div>
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
      {/* Following Sync play's leader: theirs to pause. */}
      {engine.following ? null : (
        <Button type="button" variant="ghost" size="icon" className="rounded-full" onClick={pauseStems} aria-label={t("stems.pause")}>
          <Pause />
        </Button>
      )}
    </div>
  );
}
