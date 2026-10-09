import { formatChord } from "../chords/chord.js";
import type { CapoDisplayModeValue, ChordNotationValue, ChordRowFontValue, ChordRowNamesValue, ChordRowWeightValue, SecondRowPositionValue } from "../constants/index.js";
import { CHORD_NOTATIONS } from "../constants/index.js";
import type { RenderedChord } from "../song-document/render.js";
import { chartNotation } from "../song-document/render.js";

/**
 * Rows of chords over the lyrics (issue #230): the main one, and a second
 * one, off unless turned on - each with its own names (a notation), the
 * chord it names (as it sounds, or the shape played with the
 * capo), and its own look.
 */
export interface ChordRow {
  names: ChordRowNamesValue;
  /** The chord as it sounds, or the shape played with the capo on. */
  source: CapoDisplayModeValue;
  /** The main row's is 1 (its size is the chord size); the second row's, against the main one's. */
  size: number;
  font: ChordRowFontValue;
  weight: ChordRowWeightValue;
  /** "theme", "muted", "family" (by chord type) or a colour, #rrggbb. */
  color: string;
}

export interface SecondChordRow extends ChordRow {
  position: SecondRowPositionValue;
  /** The space between the two rows, in em. */
  gap: number;
}

/** A row's names as a notation: one stored before rows had only notations (a diagram row) reads as letters. */
export function chordRowNotation(names: string): ChordNotationValue {
  return (CHORD_NOTATIONS as readonly string[]).includes(names) ? (names as ChordNotationValue) : "LETTERS";
}

/**
 * What a row shows for a chord: its name in the row's notation - numbers
 * and numerals counted from the key sung at that point, the same with or
 * without a capo. The capo's shape when the row says so and there's a
 * capo; else the sounding chord.
 */
export function chordRowLabel(chord: Pick<RenderedChord, "sounding" | "fretted" | "key">, row: Pick<ChordRow, "names" | "source">, capo: number | null): string {
  const shape = capo && row.source === "FINGERED" ? chord.fretted : chord.sounding;
  const notation = chartNotation(chordRowNotation(row.names));
  if (notation === "nashville" || notation === "roman") return formatChord(chord.sounding, notation, chord.key);
  if (notation === "solfege") return formatChord(shape, "solfege");
  return shape;
}

/** Whether a row names chords as the capo's shapes (shown in italics, issue #219). */
export function chordRowShowsShapes(row: Pick<ChordRow, "names" | "source">, capo: number | null): boolean {
  const notation = chordRowNotation(row.names);
  return !!capo && row.source === "FINGERED" && notation !== "NASHVILLE" && notation !== "ROMAN";
}
