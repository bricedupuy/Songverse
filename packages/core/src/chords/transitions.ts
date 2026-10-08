import { chordFamily, diatonicChords, nashvilleChord, parseChord, sameChord, semitoneOf, transposeChord, type NoteLetter } from "./chord.js";

/**
 * Chord progressions between two songs of a set (issue #10, phase 6 of
 * #207): a few ways from the end of one song into the first chord of the
 * next (issue #217) - its dominant, a ii-V, a chord both keys share - kept
 * as degrees of the next song's key, so they stay right when it's moved.
 */

export type TransitionKind = "dominant" | "sus-dominant" | "two-five" | "four-five" | "pivot" | "step-up" | "circle";

export interface TransitionSuggestion {
  kind: TransitionKind;
  /** The chords as degrees of the new key: ["2m7", "57"]. */
  degrees: string[];
  /** The same chords spelled in the new key: ["Em7", "A7"]. */
  chords: string[];
}

const DEGREE = /^([#b]?)([1-7])([^/\s]*)(?:\/([#b]?)([1-7]))?$/;
const MAJOR_STEPS = [0, 2, 4, 5, 7, 9, 11];
const KEY = /^\s*([A-G])([#b]?)\s*(m(?!aj)|min|minor|-)?\s*$/i;

function readKey(key: string | null | undefined): { tonic: number; minor: boolean } | null {
  const match = key ? KEY.exec(key) : null;
  if (!match) return null;
  const letter = match[1]!.toUpperCase() as NoteLetter;
  const accidental = match[2] === "#" ? "sharp" : match[2] === "b" ? "flat" : null;
  return { tonic: semitoneOf({ letter, accidental }), minor: !!match[3] };
}

/**
 * A degree of a key as a chord: "2m7" in D is Em7, "57" in A is E7, "1/3"
 * in G is G/B. Degrees count from the key's own tonic, as nashvilleChord
 * writes them (in Em, "b3" is G). A degree written with a flat is spelled
 * with flats ("b7" in D is C, "b6" Bb), one with a sharp with sharps,
 * the others as the key is. Null for something that isn't a degree, or a
 * key it can't read.
 */
export function degreeChord(degree: string, key: string | null | undefined): string | null {
  const match = DEGREE.exec(degree.trim());
  const parsed = readKey(key);
  if (!match || !parsed) return null;
  const note = (accidental: string, number: string) => {
    const steps = MAJOR_STEPS[Number(number) - 1]! + (accidental === "#" ? 1 : accidental === "b" ? -1 : 0);
    // transposeChord spells for a key: F for flats, G for sharps.
    return transposeChord("C", parsed.tonic + steps, accidental === "b" ? "F" : accidental === "#" ? "G" : key);
  };
  const chord = note(match[1]!, match[2]!) + match[3] + (match[5] ? `/${note(match[4]!, match[5])}` : "");
  return parseChord(chord)?.kind === "chord" ? chord : null;
}

/** The chords spelled in `key`, from degrees; a degree it can't read is left as it is. */
export function degreeChords(degrees: string[], key: string | null | undefined): string[] {
  return degrees.map((degree) => degreeChord(degree, key) ?? degree);
}

/**
 * Chords typed for a transition, as degrees of the key it goes into: "Em7
 * A7" in D gives ["2m7", "57"]; degrees typed ("2m7 57") are kept. Null
 * when something isn't a chord or a degree, or the key can't be read.
 */
export function transitionDegrees(text: string, key: string | null | undefined): string[] | null {
  if (!readKey(key)) return null;
  const parts = text.split(/[\s,]+/).filter(Boolean);
  const degrees: string[] = [];
  for (const part of parts) {
    if (DEGREE.test(part) && degreeChord(part, key)) degrees.push(part);
    else if (parseChord(part)?.kind === "chord") degrees.push(nashvilleChord(part, key));
    else return null;
  }
  return degrees;
}

/**
 * The key a transition resolves into: the next song's first chord taken as
 * a key of its own (Em in D: E minor), so its dominant leads to that chord;
 * the next song's key when it has no first chord, or starts on its 1.
 */
function targetKey(toKey: string, firstChord: string | null | undefined): string {
  const parsed = firstChord ? parseChord(firstChord.replace(/^\((.*)\)$/, "$1")) : null;
  if (!parsed || parsed.kind !== "chord") return toKey;
  const family = chordFamily(firstChord!);
  const root = (parsed.root.letter as string) + (parsed.root.accidental === "sharp" ? "#" : parsed.root.accidental === "flat" ? "b" : "");
  return root + (family === "minor" || family === "diminished" ? "m" : "");
}

/**
 * Ways from one song into the next, with `chords` chords each (any number
 * when left out), the simplest first. They lead into the next song's first
 * chord (`firstChord`, as played; its 1 when left out):
 * - dominant: that chord's V7;
 * - sus-dominant: V7sus4 resolving to V7;
 * - two-five: ii7 V7 (iiø7 V7 into a minor chord);
 * - four-five: IV V7 (iv V7);
 * - pivot: a chord of the old key the new one has too - still sounding like
 *   the song being left - then ii7 V7 (iv V7);
 * - step-up, a half or whole step up: bVI bVII;
 * - circle: down the circle of fifths, iii7 vi7 ii7 V7 (bIII bVI iiø7 V7).
 * Into the same key, from a song ending where the next starts: a turnaround
 * (two-five, four-five, circle). Degrees are always of the next song's key
 * (into its 4, the dominant is "17"). Empty when either key can't be read.
 */
export function transitionProgressions(
  fromKey: string | null | undefined,
  toKey: string | null | undefined,
  options: { chords?: number; firstChord?: string | null } = {},
): TransitionSuggestion[] {
  const from = readKey(fromKey);
  if (!from || !readKey(toKey)) return [];
  const target = targetKey(toKey!, options.firstChord);
  const to = readKey(target)!;
  const up = (((to.tonic - from.tonic) % 12) + 12) % 12;
  const sameKey = up === 0 && from.minor === to.minor;
  const two = to.minor ? "2m7b5" : "2m7";
  const suggestions: { kind: TransitionKind; degrees: string[] }[] = [];

  if (!sameKey) {
    suggestions.push({ kind: "dominant", degrees: ["57"] });
    suggestions.push({ kind: "sus-dominant", degrees: ["57sus4", "57"] });
  }
  suggestions.push({ kind: "two-five", degrees: [two, "57"] });
  suggestions.push({ kind: "four-five", degrees: [to.minor ? "4m" : "4", "57"] });
  if (!sameKey) {
    // A chord of the old key that the target has too, beyond the ii or IV the others already start on.
    const shared = diatonicChords(target)
      .map((chord) => chord.chord)
      .filter((chord) => diatonicChords(fromKey).some((other) => sameChord(other.chord, chord)))
      .map((chord) => nashvilleChord(chord, target));
    const pivot = (to.minor ? ["b6", "b3"] : ["6m", "3m"]).find((degree) => shared.includes(degree));
    if (pivot) suggestions.push({ kind: "pivot", degrees: [pivot, to.minor ? "4m" : "2m7", "57"] });
    if (up === 1 || up === 2) suggestions.push({ kind: "step-up", degrees: ["b6", "b7"] });
  }
  suggestions.push({ kind: "circle", degrees: to.minor ? ["b3", "b6", "2m7b5", "57"] : ["3m7", "6m7", "2m7", "57"] });

  return suggestions
    .filter((one) => options.chords === undefined || one.degrees.length === options.chords)
    .map((one) => {
      // Worked out around the target chord; kept as degrees of the next song's key.
      const degrees = target === toKey ? one.degrees : one.degrees.map((degree) => nashvilleChord(degreeChord(degree, target) ?? degree, toKey));
      return { kind: one.kind, degrees, chords: degreeChords(degrees, toKey) };
    });
}

/**
 * A chart's first and last chords as played (sounding, in the order its
 * passes come): where a set's transition starts and where it leads.
 * Nulls for a chart without chords.
 */
export function chartEdgeChords(chart: { passes: { lines: { chords: { sounding: string }[] }[] }[] }): { first: string | null; last: string | null } {
  let first: string | null = null;
  let last: string | null = null;
  for (const pass of chart.passes) {
    for (const line of pass.lines) {
      for (const chord of line.chords) {
        if (parseChord(chord.sounding)?.kind !== "chord") continue;
        first ??= chord.sounding;
        last = chord.sounding;
      }
    }
  }
  return { first, last };
}
