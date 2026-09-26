import { formatChord, simplifyChord, transposeChord, type ChordNotation } from "../chords/chord.js";
import { transposeKey } from "../music-keys/transpose.js";
import {
  ArrangementDocumentV2Schema,
  placeChords,
  type ArrangementDocumentV2,
  type ChartPreferences,
  type OverrideV2,
} from "../schemas/arrangement-document-v2.js";
import type { LineKind, SectionInstance, SectionV2, SongDocumentV2 } from "../schemas/song-document-v2.js";

/**
 * A chart as it's drawn: the song, played the way an arrangement says (or
 * as written), seen the way this player wants. One function so the web
 * chart, perform mode and a mobile app agree on every pass and chord. See
 * docs/arrangement-document-v2.md, "Rendering a pass".
 */

/** How this player reads the chart. None of it changes the song or the arrangement. */
export interface ChartView {
  /** Semitones on top of the arrangement's key: a set's own transposition for this song. */
  transposeSteps?: number;
  /** The player's own chart preferences (hidden chords, simpler chords, no bass notes). */
  preferences?: Partial<ChartPreferences> | null;
  /** Chord names in letters ("G") or solfège ("Sol"). */
  notation?: ChordNotation;
  /** With a capo: chords as they sound (the default), or as the shapes a guitarist plays. */
  capoDisplay?: "sounding" | "shapes";
  /** The capo written on the song, used when the arrangement sets none (it's only a suggestion). */
  suggestedCapo?: number | null;
}

export interface RenderedChord {
  id: string;
  at: number;
  /** What's shown: transposed, capo shapes, simplified, named - everything applied. */
  label: string;
  /** Replaced by the arrangement on this pass. */
  replaced: boolean;
}

export interface RenderedLine {
  id: string;
  kind: LineKind;
  text: string;
  chords: RenderedChord[];
  /** The arrangement's note on this line (a performance note). */
  note: string | null;
  /** Added by the arrangement on this pass. */
  inserted: boolean;
  /** Its words differ from the song's on this pass. */
  lyricChanged: boolean;
}

export interface RenderedPass {
  /** The flow item's or arrangement item's ID. */
  id: string;
  section: Pick<SectionV2, "id" | "type" | "label" | "showLabel">;
  /** The pass's own label ("Final chorus"); null for the section's. */
  label: string | null;
  note: string | null;
  /** The key this pass starts in, when it changes here (as sounding). */
  keyChange: string | null;
  /** The key in effect on this pass, as sounding; null when the song has no key. */
  key: string | null;
  tempo: number | null;
  lines: RenderedLine[];
  /** The arrangement changes something on this pass: the band should know it's not as usual. */
  differs: boolean;
  /** References that no longer match the song (deleted lines or chords); shown, never dropped silently. */
  problems: string[];
}

export interface RenderedChart {
  /** The key it starts in, as sounding. */
  key: string | null;
  capo: number | null;
  tempo: number | null;
  timeSignature: SongDocumentV2["defaults"]["timeSignature"];
  passes: RenderedPass[];
}

type Item = SectionInstance & { overrides?: OverrideV2[] };

/** The song played as `arrangement` says (or as written), seen through `view`. */
export function renderChart(song: SongDocumentV2, arrangement: ArrangementDocumentV2 | null = null, view: ChartView = {}): RenderedChart {
  const sections = new Map(song.sections.map((section) => [section.id, section]));
  const items: Item[] = arrangement
    ? arrangement.items
    : song.flow.length > 0
      ? song.flow
      : song.sections.map((section) => ({ id: section.id, sectionId: section.id }));
  const defaults = arrangement?.defaults;
  const capo = defaults?.capo || view.suggestedCapo || null;
  const hidden = new Set(view.preferences?.hiddenChordIds ?? []);
  const songKey = song.defaults.key ?? null;
  const baseSteps = (defaults?.transposeSteps ?? 0) + (view.transposeSteps ?? 0);
  const keyAt = (steps: number) => (songKey ? (transposeKey(songKey, steps) ?? songKey) : null);

  // How one chord (written in the song's key) is shown with `steps` in effect.
  const show = (raw: string, steps: number, key: string | null) => {
    let label = transposeChord(raw, steps, key);
    if (capo && view.capoDisplay === "shapes") label = transposeChord(label, -capo, key ? transposeKey(key, -capo) : null);
    if (view.preferences?.simplifyChords || view.preferences?.hideBassNotes) {
      label = simplifyChord(label, { dropExtensions: !!view.preferences?.simplifyChords, dropBass: !!view.preferences?.hideBassNotes });
    }
    return view.notation === "solfege" ? formatChord(label, "solfege") : label;
  };

  let steps = baseSteps;
  let tempo = defaults?.tempo ?? song.defaults.tempo ?? null;
  const passes: RenderedPass[] = [];
  for (const item of items) {
    const section = sections.get(item.sectionId);
    if (item.keyChange) steps += item.keyChange.steps;
    if (item.tempo) tempo = item.tempo;
    if (!section) continue;
    const key = keyAt(steps);
    const overrides = item.overrides ?? [];
    const problems: string[] = [];
    const lineIds = new Set(section.lines.map((line) => line.id));

    // 1-3: the section's lines, less hidden ones, plus inserted ones.
    type Working = { id: string; kind: LineKind; text: string; chords: { id: string; at: number; raw: string; replaced: boolean }[]; note: string | null; inserted: boolean; lyricChanged: boolean };
    const toWorking = (line: SectionV2["lines"][number], inserted: boolean): Working => ({
      id: line.id,
      kind: line.kind,
      text: line.text,
      chords: line.chords.map((chord) => ({ ...chord, replaced: false })),
      note: null,
      inserted,
      lyricChanged: false,
    });
    const hiddenLines = new Set(overrides.flatMap((o) => (o.type === "hide_line" ? [o.lineId] : [])));
    // Placed among every line, hidden ones too: a line added after a hidden one shows where it was.
    let lines: Working[] = section.lines.map((line) => toWorking(line, false));
    for (const override of overrides) {
      if (override.type !== "insert_line") continue;
      const inserted = toWorking(override.line, true);
      if (override.afterLineId === null) lines = [inserted, ...lines];
      else {
        const at = lines.findIndex((line) => line.id === override.afterLineId);
        if (at >= 0) lines.splice(at + 1, 0, inserted);
        else problems.push(`line ${override.afterLineId} not found`);
      }
    }
    lines = lines.filter((line) => line.inserted || !hiddenLines.has(line.id));
    const byLine = new Map(lines.map((line) => [line.id, line]));
    const findChord = (chordId: string) => {
      for (const line of lines) {
        const chord = line.chords.find((c) => c.id === chordId);
        if (chord) return { line, chord };
      }
      return null;
    };
    const known = (lineId: string) => byLine.has(lineId) || lineIds.has(lineId) || hiddenLines.has(lineId);

    // 4-6: lyrics, chords, notes.
    for (const override of overrides) {
      switch (override.type) {
        case "lyric": {
          const line = byLine.get(override.lineId);
          if (!line) {
            if (!known(override.lineId)) problems.push(`line ${override.lineId} not found`);
            break;
          }
          line.chords = placeChords(line.chords, override.text, override.chordPositions);
          line.text = override.text;
          line.lyricChanged = true;
          break;
        }
        case "chord": {
          const found = findChord(override.chordId);
          if (found) Object.assign(found.chord, { raw: override.raw, replaced: true });
          else if (!song.sections.some((s) => s.lines.some((l) => l.chords.some((c) => c.id === override.chordId)))) problems.push(`chord ${override.chordId} not found`);
          break;
        }
        case "hide_chord": {
          const found = findChord(override.chordId);
          if (found) found.line.chords = found.line.chords.filter((chord) => chord.id !== override.chordId);
          else if (!song.sections.some((s) => s.lines.some((l) => l.chords.some((c) => c.id === override.chordId)))) problems.push(`chord ${override.chordId} not found`);
          break;
        }
        case "performance_note": {
          const line = byLine.get(override.lineId);
          if (line) line.note = override.note;
          else if (!known(override.lineId)) problems.push(`line ${override.lineId} not found`);
          break;
        }
        case "hide_line":
          if (!lineIds.has(override.lineId)) problems.push(`line ${override.lineId} not found`);
          break;
        case "insert_line":
          break;
      }
    }

    // 7-8: transposed, then the player's own view.
    passes.push({
      id: item.id,
      section: { id: section.id, type: section.type, label: section.label ?? null, showLabel: section.showLabel },
      label: item.label ?? null,
      note: item.note ?? null,
      keyChange: item.keyChange ? (key ?? item.keyChange.key) : null,
      key,
      tempo,
      lines: lines.map((line) => ({
        id: line.id,
        kind: line.kind,
        text: line.text,
        note: line.note,
        inserted: line.inserted,
        lyricChanged: line.lyricChanged,
        chords: line.chords
          .filter((chord) => !hidden.has(chord.id))
          .map((chord) => ({ id: chord.id, at: chord.at, label: show(chord.raw, steps, key), replaced: chord.replaced })),
      })),
      differs: overrides.length > 0,
      problems,
    });
  }

  return {
    key: keyAt(baseSteps),
    capo,
    tempo: defaults?.tempo ?? song.defaults.tempo ?? null,
    timeSignature: defaults?.timeSignature ?? song.defaults.timeSignature ?? null,
    passes,
  };
}

/** The tempo assumed when a song has none, and the bars a sung line usually takes. */
const DEFAULT_TEMPO = 90;
const BARS_PER_LINE = 2;

/**
 * How long a chart takes to play, in seconds, to pace autoscroll: the
 * song's own duration when it has one, or else two bars a line at each
 * pass's tempo (notes, which aren't sung, take no time).
 */
export function chartSeconds(chart: RenderedChart, durationSeconds?: number | null): number {
  if (durationSeconds && durationSeconds > 0) return durationSeconds;
  const beatsPerBar = chart.timeSignature?.numerator ?? 4;
  let seconds = 0;
  for (const pass of chart.passes) {
    const lines = pass.lines.filter((line) => line.kind !== "note").length;
    seconds += (lines * BARS_PER_LINE * beatsPerBar * 60) / (pass.tempo ?? DEFAULT_TEMPO);
  }
  return seconds;
}

/** A new arrangement of `song`: its order as the song's flow, nothing changed yet. */
export function newArrangementDocument(song: SongDocumentV2, songVersionId: string, makeId: () => string): ArrangementDocumentV2 {
  const flow = song.flow.length > 0 ? song.flow : song.sections.map((section) => ({ id: section.id, sectionId: section.id }));
  return {
    $schema: "arrangement-document/v2",
    songVersionId,
    songRevision: song.revision,
    defaults: { transposeSteps: 0 },
    items: flow.map((item) => ({ ...item, id: makeId(), overrides: [] })),
  };
}

/**
 * A stored arrangement as v2. One that can't be read as v2 (saved in an
 * older format) starts again from the song's order - `readable` says so, and
 * nothing is lost until it's saved.
 */
export function readArrangementDocument(
  json: unknown,
  song: SongDocumentV2,
  songVersionId: string,
  makeId: () => string,
): { document: ArrangementDocumentV2; readable: boolean } {
  const parsed = ArrangementDocumentV2Schema.safeParse(json);
  if (parsed.success) return { document: parsed.data, readable: true };
  return { document: { ...newArrangementDocument(song, songVersionId, makeId), songRevision: 0 }, readable: false };
}
