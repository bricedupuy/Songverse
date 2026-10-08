import {
  chartChords,
  chordShapes,
  formatChord,
  FRETTED_INSTRUMENTS,
  shapeText,
  type ChordDiagramsValue,
  type ChordShapeChoice,
  type DiagramPlayer,
  type ChordNotationValue,
  type ChordShape,
  type PianoVoicing,
  pianoVoicings,
  songVoicings,
  voicingText,
  type InstrumentId,
  type RenderedChart,
  type RenderedChord,
} from "@songverse/core";
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ComponentProps } from "react";
import { useTranslation } from "react-i18next";
import { SongChart } from "#/components/song-chart";
import { Popover, PopoverContent } from "#/components/ui/popover";
import { apiClient } from "#/lib/api-client";
import { playPiano, strum } from "#/lib/chord-sound";
import { KeyboardDiagram } from "#/components/keyboard-diagram";
import { ButtonGroup } from "#/components/ui/button-group";
import { cn } from "#/lib/utils";

/**
 * Chord diagrams beside a chart (issue #207): off unless the player chose an
 * instrument. Never over the lyrics - a strip of the song's chords at the
 * top of the chart, scrolling away with it and folding to one line, and a
 * chord's diagram in a small card when it's tapped. Drawn from core's shapes
 * as docs/chord-diagrams.md describes, for the chord a guitarist frets with
 * the capo on (a ukulele player gets the chord as it sounds).
 */

const FOLDED_KEY = "songverse.chordStrip.folded";

function instrumentOf(mode: ChordDiagramsValue): InstrumentId | "piano" | null {
  return mode === "GUITAR" ? "guitar" : mode === "UKULELE" ? "ukulele" : mode === "PIANO" ? "piano" : null;
}

/** Spacing of the drawing, in its own units (it scales with the text). */
const STRING_GAP = 10;
const FRET_GAP = 12;
const FRETS_SHOWN = 4;
const TOP = 12;
const LEFT = 12;

/** One chord shape as a diagram: strings up and down, frets across, × muted, ○ open, a dot per finger, a bar for a barre. */
export function ChordDiagram({
  shape,
  instrument,
  name,
  fingers = false,
  leftHanded = false,
  className,
}: {
  shape: ChordShape;
  instrument: InstrumentId;
  name: string;
  /** Finger numbers in the dots: for the bigger diagram. */
  fingers?: boolean;
  /** Mirrored, the lowest string on the right, as a left-handed player holds it (issue #207). */
  leftHanded?: boolean;
  className?: string;
}) {
  const { t } = useTranslation();
  const strings = FRETTED_INSTRUMENTS[instrument].strings.length;
  const width = LEFT + (strings - 1) * STRING_GAP + 8;
  const height = TOP + FRETS_SHOWN * FRET_GAP + 4;
  const x = (string: number) => LEFT + (leftHanded ? strings - 1 - string : string) * STRING_GAP;
  const y = (fret: number) => TOP + (fret - shape.baseFret + 0.5) * FRET_GAP;
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={t("chords.diagramLabel", { chord: name, shape: shapeText(shape) })}
      className={cn("text-foreground", className)}
      data-shape={shapeText(shape)}
      data-left-handed={leftHanded ? "" : undefined}
    >
      {/* The nut, thick, when the shape is near it; else the fret it starts at. */}
      {shape.baseFret === 1 ? (
        <line x1={x(0)} x2={x(strings - 1)} y1={TOP} y2={TOP} stroke="currentColor" strokeWidth={2.5} strokeLinecap="square" />
      ) : (
        <text x={LEFT - 4} y={TOP + FRET_GAP * 0.5 + 3} fontSize={8} textAnchor="end" fill="currentColor">
          {shape.baseFret}
        </text>
      )}
      {Array.from({ length: FRETS_SHOWN + 1 }, (_, i) => (
        <line key={`f${i}`} x1={x(0)} x2={x(strings - 1)} y1={TOP + i * FRET_GAP} y2={TOP + i * FRET_GAP} stroke="currentColor" strokeOpacity={0.45} strokeWidth={0.75} />
      ))}
      {Array.from({ length: strings }, (_, i) => (
        <line key={`s${i}`} x1={x(i)} x2={x(i)} y1={TOP} y2={TOP + FRETS_SHOWN * FRET_GAP} stroke="currentColor" strokeOpacity={0.6} strokeWidth={0.75} />
      ))}
      {shape.frets.map((fret, string) =>
        fret === null ? (
          <path key={`m${string}`} d={`M${x(string) - 2.5} ${TOP - 7.5}l5 5m0 -5l-5 5`} stroke="currentColor" strokeWidth={1} />
        ) : fret === 0 ? (
          <circle key={`o${string}`} cx={x(string)} cy={TOP - 5} r={2.5} fill="none" stroke="currentColor" strokeWidth={1} />
        ) : null,
      )}
      {shape.barres.map((barre) => (
        <rect
          key={`b${barre.fret}`}
          x={Math.min(x(barre.from), x(barre.to)) - 3.5}
          y={y(barre.fret) - 3.5}
          width={Math.abs(x(barre.to) - x(barre.from)) + 7}
          height={7}
          rx={3.5}
          fill="currentColor"
        />
      ))}
      {shape.frets.map((fret, string) => {
        if (!fret) return null;
        const underBarre = shape.barres.some((barre) => barre.fret === fret && string >= barre.from && string <= barre.to);
        return (
          <g key={`d${string}`}>
            {underBarre ? null : <circle cx={x(string)} cy={y(fret)} r={3.6} fill="currentColor" />}
            {fingers && shape.fingers[string] && !(underBarre && string !== shape.barres[0]?.from) ? (
              <text x={x(string)} y={y(fret) + 2.2} fontSize={6} textAnchor="middle" fill="var(--color-background)" fontWeight={600}>
                {shape.fingers[string]}
              </text>
            ) : null}
          </g>
        );
      })}
    </svg>
  );
}

/** What diagrams are drawn for: a fretted instrument, or a piano (issue #207 phase 4). */
type Instrument = InstrumentId | "piano";

/** How this player's diagrams are made (issue #207): the instrument, its tuning, mirrored or not, the piano's options, and the shapes they chose for this song. */
interface Setup {
  instrument: Instrument;
  tuning: string;
  leftHanded: boolean;
  /** Piano: both hands or the right only; note names on the keys. */
  pianoHands: "both" | "right";
  pianoNames: "card" | "all" | "none";
  /** Piano: which voicing of each chord the song starts the card at (voice leading, or root position). */
  start: Map<string, number>;
  /** Chord → the shape chosen for it in this song (shapeText or voicingText). */
  chosen: Map<string, string>;
  /** Keeps a shape for a chord of this song (null: back to the usual one); absent where it can't be saved. */
  choose?: (chord: string, text: string | null) => void;
}

/** One way to play a chord: a fretted shape or a piano voicing, as drawn, kept and heard. */
interface Option {
  /** As kept for a player's choice: shapeText or voicingText. */
  text: string;
  /** What's heard when it's tapped (MIDI), lowest first. */
  notes: number[];
  shape?: ChordShape;
  voicing?: PianoVoicing;
}

/** The chord's ways to play it, easiest (or nearest the chord before, on a piano) first - the one chosen for this song before them all. */
function optionsFor(chord: string, setup: Setup, limit: number): Option[] {
  let options: Option[];
  if (setup.instrument === "piano") {
    const voicings = pianoVoicings(chord, { hands: setup.pianoHands });
    const first = setup.start.get(chord) ?? 0;
    options = [...voicings.slice(first), ...voicings.slice(0, first)].map((voicing) => ({
      text: voicingText(voicing),
      notes: [...voicing.left, ...voicing.right],
      voicing,
    }));
  } else {
    const instrument = setup.instrument;
    const toOption = (shape: ChordShape): Option => ({ text: shapeText(shape), notes: shape.notes, shape });
    options = chordShapes(chord, instrument, limit, setup.tuning).map(toOption);
    const wanted = setup.chosen.get(chord);
    if (wanted && !options.some((option) => option.text === wanted)) {
      const found = chordShapes(chord, instrument, 24, setup.tuning).find((shape) => shapeText(shape) === wanted);
      if (found) options.push(toOption(found));
    }
  }
  const wanted = setup.chosen.get(chord);
  const chosen = wanted ? options.find((option) => option.text === wanted) : undefined;
  return chosen ? [chosen, ...options.filter((option) => option !== chosen)] : options;
}

/** Heard: a fretted shape strummed (down, then up on the next tap); a piano voicing played, the bass first. */
function play(option: Option, setup: Setup, up: { current: boolean }) {
  if (option.voicing) playPiano(option.voicing.left, option.voicing.right);
  else {
    strum(option.notes, { up: up.current, gap: setup.instrument === "ukulele" ? 0.02 : 0.028 });
    up.current = !up.current;
  }
}

/** An option drawn: its fretboard, or its keyboard. */
function OptionDiagram({ option, setup, chord, name, notation, large }: { option: Option; setup: Setup; chord: string; name: string; notation: ChordNotationValue; large?: boolean }) {
  if (option.voicing)
    return (
      <KeyboardDiagram
        voicing={option.voicing}
        chord={chord}
        name={name}
        notation={notation}
        names={setup.pianoNames === "all" || (large === true && setup.pianoNames === "card")}
        className={large ? "h-24 w-auto" : "h-12 w-auto"}
      />
    );
  return (
    <ChordDiagram
      shape={option.shape!}
      instrument={setup.instrument as InstrumentId}
      leftHanded={setup.leftHanded}
      name={name}
      fingers={large}
      className={large ? "h-32 w-auto" : "h-14 w-auto"}
    />
  );
}

/** A chord's name as the player reads chords: letters or solfège. */
function shownName(chord: string, notation: ChordNotationValue) {
  return notation === "SOLFEGE" ? formatChord(chord, "solfege") : chord;
}

const STRIP_TITLE: Record<Instrument, string> = { guitar: "chords.guitar", ukulele: "chords.ukulele", piano: "chords.piano" };

/**
 * The song's chords, each once, in the order they first come, as small
 * diagrams: tap one to hear it. Folds to one line, remembered on the device.
 */
function ChordStrip({ chords, chart, setup, notation }: { chords: string[]; chart: Pick<RenderedChart, "capo">; setup: Setup; notation: ChordNotationValue }) {
  const { t } = useTranslation();
  const { instrument } = setup;
  const [folded, setFolded] = useState(false);
  const up = useRef(false);
  useEffect(() => {
    try {
      setFolded(localStorage.getItem(FOLDED_KEY) === "1");
    } catch {
      // Storage blocked: unfolded.
    }
  }, []);
  function fold(next: boolean) {
    setFolded(next);
    try {
      localStorage.setItem(FOLDED_KEY, next ? "1" : "0");
    } catch {
      // Storage blocked: for this page only.
    }
  }
  if (chords.length === 0) return null;
  const capo = instrument === "guitar" && chart.capo ? t("chords.capoShapes", { capo: chart.capo }) : null;
  return (
    <div className="flex flex-col gap-1 font-sans" data-testid="chord-strip" data-instrument={instrument} data-folded={folded ? "" : undefined}>
      <button
        type="button"
        onClick={() => fold(!folded)}
        aria-expanded={!folded}
        className="flex min-w-0 items-center gap-1 self-start text-xs font-medium text-muted-foreground hover:text-foreground"
      >
        {folded ? <ChevronDown className="size-3.5 shrink-0" aria-hidden /> : <ChevronUp className="size-3.5 shrink-0" aria-hidden />}
        <span className="shrink-0">{t(STRIP_TITLE[instrument])}</span>
        {folded ? <span className="truncate font-normal">{chords.map((chord) => shownName(chord, notation)).join(" · ")}</span> : null}
        {capo ? <span className="shrink-0 font-normal">· {capo}</span> : null}
      </button>
      {folded ? null : (
        <div className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1">
          {chords.map((chord) => {
            const option = optionsFor(chord, setup, 1)[0];
            return (
              <button
                key={chord}
                type="button"
                disabled={!option}
                onClick={() => option && play(option, setup, up)}
                aria-label={t("chords.play", { chord: shownName(chord, notation) })}
                className="flex shrink-0 flex-col items-center rounded-md px-1 pt-0.5 hover:bg-muted disabled:opacity-50"
                data-chord-diagram={chord}
              >
                <span className="text-xs font-bold text-primary">{shownName(chord, notation)}</span>
                {option ? (
                  <OptionDiagram option={option} setup={setup} chord={chord} name={shownName(chord, notation)} notation={notation} />
                ) : (
                  <span className="h-14 text-xs text-muted-foreground">?</span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** A chord's diagram, bigger, with its fingers (or note names), the other ways to play it (‹ ›), and heard with a tap. */
function ChordCard({ chord, setup, notation }: { chord: string; setup: Setup; notation: ChordNotationValue }) {
  const { t } = useTranslation();
  // In the order the card opened with: choosing one doesn't reshuffle them under the player.
  const options = useMemo(() => optionsFor(chord, setup, 6), [chord, setup.instrument, setup.tuning, setup.pianoHands]);
  const [index, setIndex] = useState(0);
  const chosen = setup.chosen.get(chord) ?? null;
  const up = useRef(false);
  const option = options[index];
  const name = shownName(chord, notation);
  return (
    <div className="flex flex-col items-center gap-1" data-testid="chord-card" data-chord={chord}>
      <p className="text-sm font-bold text-primary">{name}</p>
      {option ? (
        <>
          <button type="button" className="rounded-md p-1 hover:bg-muted" aria-label={t("chords.play", { chord: name })} onClick={() => play(option, setup, up)}>
            <OptionDiagram option={option} setup={setup} chord={chord} name={name} notation={notation} large />
          </button>
          {options.length > 1 ? (
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <button type="button" className="rounded p-1 hover:bg-muted disabled:opacity-40" disabled={index === 0} onClick={() => setIndex(index - 1)} aria-label={t("chords.previousShape")}>
                <ChevronLeft className="size-4" />
              </button>
              <span className="tabular-nums" data-testid="chord-card-position">
                {t("chords.shapeOf", { n: index + 1, count: options.length })}
              </span>
              <button
                type="button"
                className="rounded p-1 hover:bg-muted disabled:opacity-40"
                disabled={index === options.length - 1}
                onClick={() => setIndex(index + 1)}
                aria-label={t("chords.nextShape")}
              >
                <ChevronRight className="size-4" />
              </button>
            </div>
          ) : null}
          {setup.choose ? (
            option.text === chosen ? (
              <p className="flex items-center gap-1 text-xs text-muted-foreground" data-testid="chord-card-chosen">
                {t("chords.yourShape")}
                <button type="button" className="text-primary hover:underline" onClick={() => setup.choose?.(chord, null)}>
                  {t("chords.backToUsual")}
                </button>
              </p>
            ) : (
              <button type="button" className="text-xs text-primary hover:underline" onClick={() => setup.choose?.(chord, option.text)}>
                {t(setup.instrument === "piano" ? "chords.useThisVoicing" : "chords.useThisShape")}
              </button>
            )
          ) : null}
          <p className="text-xs text-muted-foreground">{t("chords.tapToHear")}</p>
        </>
      ) : (
        <p className="text-xs text-muted-foreground">{t("chords.noShape")}</p>
      )}
    </div>
  );
}

/**
 * A chart with the player's chord diagrams: the strip above it, and a
 * chord's card when it's tapped. With diagrams off, the chart as it was.
 * `onChordClick` (a set's "Hide chords") takes the chord taps over.
 */
export function ChartWithDiagrams({
  chart,
  diagrams,
  notation,
  player,
  songVersionId,
  onChordClick,
  ...props
}: ComponentProps<typeof SongChart> & {
  diagrams: ChordDiagramsValue | undefined;
  notation: ChordNotationValue;
  /** Left-handed, and the tunings (issue #207 phase 3). */
  player?: DiagramPlayer;
  /** The song: the shapes the player chose for its chords are kept for it. Without it, nothing's chosen. */
  songVersionId?: string;
}) {
  const instrument = instrumentOf(diagrams ?? "OFF");
  const [open, setOpen] = useState<{ chord: string; anchor: HTMLElement } | null>(null);
  const tuning = instrument === "piano" ? "standard" : ((instrument === "ukulele" ? player?.ukuleleTuning : player?.guitarTuning) ?? "standard");
  const pianoHands = player?.pianoHands === "right" ? "right" : "both";
  const smooth = player?.pianoSmooth !== false;
  // The chords at the top, as fretted with the capo on (a guitar) or as they sound.
  const chords = useMemo(() => (instrument ? chartChords(chart, instrument === "guitar" ? "fretted" : "sounding") : []), [chart, instrument]);
  const [choices, setChoices] = useState<ChordShapeChoice[]>([]);
  useEffect(() => {
    setChoices([]);
    if (!instrument || !songVersionId) return;
    let current = true;
    // Offline (or a song this player can't read): the usual shapes.
    apiClient
      .getChordShapeChoices(songVersionId)
      .then((found) => current && setChoices(found))
      .catch(() => undefined);
    return () => {
      current = false;
    };
  }, [instrument, songVersionId]);
  const setup = useMemo<Setup | null>(() => {
    if (!instrument) return null;
    const chosen = new Map(choices.filter((one) => one.instrument === instrument && one.tuning === tuning).map((one) => [one.chord, one.frets]));
    const choose = songVersionId
      ? (chord: string, frets: string | null) =>
          void apiClient
            .chooseChordShape(songVersionId, { instrument, tuning, chord, frets })
            .then(setChoices)
            .catch(() => undefined)
      : undefined;
    // A piano's voicings as the song goes: each nearest the one before, or root position.
    const start = new Map<string, number>();
    if (instrument === "piano") songVoicings(chords, { hands: pianoHands, smooth }).forEach((index, i) => start.set(chords[i]!, index));
    const pianoNames = player?.pianoNoteNames === "all" || player?.pianoNoteNames === "none" ? player.pianoNoteNames : "card";
    return { instrument, tuning, leftHanded: !!player?.leftHanded, pianoHands, pianoNames, start, chosen, choose };
  }, [instrument, tuning, player?.leftHanded, player?.pianoNoteNames, pianoHands, smooth, chords, choices, songVersionId]);
  if (!instrument || !setup) return <SongChart chart={chart} onChordClick={onChordClick} {...props} />;
  return (
    <div className="flex flex-col gap-3">
      <ChordStrip chords={chords} chart={chart} setup={setup} notation={notation} />
      <SongChart
        chart={chart}
        {...props}
        onChordClick={
          onChordClick ??
          ((_id, element, chord: RenderedChord) => setOpen({ chord: instrument === "guitar" ? chord.fretted : chord.sounding, anchor: element }))
        }
        chordClickAction={onChordClick ? "hide" : "diagram"}
      />
      <Popover open={open !== null} onOpenChange={(next) => !next && setOpen(null)}>
        {open ? (
          <PopoverContent anchor={open.anchor} className="w-auto min-w-36 p-2">
            <ChordCard key={open.chord} chord={open.chord} setup={setup} notation={notation} />
          </PopoverContent>
        ) : null}
      </Popover>
    </div>
  );
}

/**
 * A few chords on their own - a set's transition into the next song (issue
 * #10): their names, with the player's diagrams when they have some on, each
 * tapped to hear it (on a guitar without diagrams). In Nashville numbers,
 * as degrees of `musicalKey`. `names` keeps to the names (a list to choose
 * from), still heard on the player's instrument.
 */
export function ChordRow({
  chords,
  diagrams,
  notation,
  player,
  musicalKey,
  names = false,
  className,
  testId = "chord-row",
}: {
  chords: string[];
  diagrams: ChordDiagramsValue | undefined;
  notation: ChordNotationValue;
  player?: DiagramPlayer;
  musicalKey?: string | null;
  names?: boolean;
  className?: string;
  testId?: string;
}) {
  const { t } = useTranslation();
  const chosen = instrumentOf(diagrams ?? "OFF");
  const drawn = names ? null : chosen;
  const instrument = chosen ?? "guitar";
  const up = useRef(false);
  const setup = useMemo<Setup>(() => {
    const tuning = instrument === "piano" ? "standard" : ((instrument === "ukulele" ? player?.ukuleleTuning : player?.guitarTuning) ?? "standard");
    const pianoNames = player?.pianoNoteNames === "all" || player?.pianoNoteNames === "none" ? player.pianoNoteNames : "card";
    const pianoHands = player?.pianoHands === "right" ? "right" : "both";
    const start = new Map<string, number>();
    if (instrument === "piano") songVoicings(chords, { hands: pianoHands, smooth: player?.pianoSmooth !== false }).forEach((index, i) => start.set(chords[i]!, index));
    return { instrument, tuning, leftHanded: !!player?.leftHanded, pianoHands, pianoNames, start, chosen: new Map() };
  }, [instrument, chords, player?.ukuleleTuning, player?.guitarTuning, player?.pianoNoteNames, player?.pianoHands, player?.pianoSmooth, player?.leftHanded]);
  const name = (chord: string) => (notation === "NASHVILLE" ? formatChord(chord, "nashville", musicalKey) : shownName(chord, notation));
  return (
    <span className={cn("flex flex-wrap items-end gap-1", className)} data-testid={testId}>
      {chords.map((chord, i) => {
        const option = optionsFor(chord, setup, 1)[0];
        return (
          <button
            key={`${i}-${chord}`}
            type="button"
            disabled={!option}
            onClick={() => option && play(option, setup, up)}
            aria-label={t("chords.play", { chord: name(chord) })}
            className={cn("flex shrink-0 flex-col items-center rounded-md px-1.5 hover:bg-muted disabled:opacity-60", drawn ? "pt-0.5" : "border py-0.5")}
            data-chord={chord}
          >
            <span className="text-sm font-bold text-primary">{name(chord)}</span>
            {drawn && option ? <OptionDiagram option={option} setup={setup} chord={chord} name={name(chord)} notation={notation} /> : null}
          </button>
        );
      })}
    </span>
  );
}

/** A step of a progression shown as `ChordSteps`: a chord, or a gap still to fill ("…"). */
export interface ChordStep {
  chord: string | null;
  /** Where the transition starts and lands (the songs' own chords) are quieter than the chords between. */
  edge?: boolean;
  /** For tests and styling: "last", "step", "first". */
  role: string;
}

/**
 * A progression as one row of chevron-shaped buttons, read left to right
 * (issue #214): each chord tapped to hear it on the player's instrument;
 * `expanded`, its diagram under its name.
 */
export function ChordSteps({
  steps,
  expanded,
  diagrams,
  notation,
  player,
  musicalKey,
  size = "default",
  className,
}: {
  steps: ChordStep[];
  expanded: boolean;
  /** "sm": smaller steps on one line, for a list of them (the transition chooser). */
  size?: "default" | "sm";
  diagrams: ChordDiagramsValue | undefined;
  notation: ChordNotationValue;
  player?: DiagramPlayer;
  musicalKey?: string | null;
  className?: string;
}) {
  const { t } = useTranslation();
  const chosen = instrumentOf(diagrams ?? "OFF");
  const instrument = chosen ?? "guitar";
  const up = useRef(false);
  const chords = steps.flatMap((step) => (step.chord ? [step.chord] : []));
  const setup = useMemo<Setup>(() => {
    const tuning = instrument === "piano" ? "standard" : ((instrument === "ukulele" ? player?.ukuleleTuning : player?.guitarTuning) ?? "standard");
    const pianoNames = player?.pianoNoteNames === "all" || player?.pianoNoteNames === "none" ? player.pianoNoteNames : "card";
    const pianoHands = player?.pianoHands === "right" ? "right" : "both";
    const start = new Map<string, number>();
    if (instrument === "piano") songVoicings(chords, { hands: pianoHands, smooth: player?.pianoSmooth !== false }).forEach((index, i) => start.set(chords[i]!, index));
    return { instrument, tuning, leftHanded: !!player?.leftHanded, pianoHands, pianoNames, start, chosen: new Map() };
    // The chords as text: the same progression keeps its setup.
  }, [instrument, chords.join(" "), player?.ukuleleTuning, player?.guitarTuning, player?.pianoNoteNames, player?.pianoHands, player?.pianoSmooth, player?.leftHanded]);
  const name = (chord: string) => (notation === "NASHVILLE" ? formatChord(chord, "nashville", musicalKey) : shownName(chord, notation));
  return (
    <ButtonGroup variant="chevron" className={cn(size === "sm" ? "flex-nowrap" : "max-w-full flex-wrap gap-y-1", className)} data-testid="chord-steps" data-expanded={expanded ? "" : undefined}>
      {steps.map((step, i) => {
        const option = step.chord ? optionsFor(step.chord, setup, 1)[0] : undefined;
        return (
          <button
            key={`${i}-${step.chord ?? "gap"}`}
            type="button"
            disabled={!option}
            onClick={() => option && play(option, setup, up)}
            aria-label={step.chord ? t("chords.play", { chord: name(step.chord) }) : undefined}
            className={cn(
              "flex shrink-0 flex-col items-center justify-center font-bold whitespace-nowrap transition-colors disabled:cursor-default",
              size === "sm" ? "min-h-7 py-0.5 text-xs [--step-padding:0.3rem]" : "min-h-9 text-sm",
              size === "sm" ? null : expanded ? "gap-0.5 py-1.5 [--step-padding:0.875rem]" : "py-1 [--step-padding:0.5rem]",
              step.edge ? "bg-muted text-muted-foreground hover:bg-muted/70" : "bg-secondary text-primary hover:bg-accent",
              !step.chord && "font-normal text-muted-foreground",
            )}
            data-chord={step.chord ?? undefined}
            data-step={step.role}
          >
            <span>{step.chord ? name(step.chord) : "…"}</span>
            {expanded && option ? <OptionDiagram option={option} setup={setup} chord={step.chord!} name={name(step.chord!)} notation={notation} /> : null}
          </button>
        );
      })}
    </ButtonGroup>
  );
}
