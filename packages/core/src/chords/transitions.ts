import { chordFamily, diatonicChords, nashvilleChord, parseChord, sameChord, semitoneOf, simplifyChord, transposeChord, type NoteLetter } from "./chord.js";

/**
 * Chord progressions between two songs of a set (issue #10, phase 6 of
 * #207): a few ways from the end of one song into the first chord of the
 * next (issue #217) - its dominant, a ii-V, a chord both keys share - kept
 * as degrees of the next song's key, so they stay right when it's moved.
 */

export type TransitionKind = "walking-bass" | "walk-sus" | "key-dominant" | "dominant" | "sus-dominant" | "two-five" | "four-five" | "pivot" | "step-up" | "circle";

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

const SCALES = { major: [0, 2, 4, 5, 7, 9, 11], minor: [0, 2, 3, 5, 7, 8, 10] };
const TRIADS: Record<string, number[]> = { major: [0, 4, 7], minor: [0, 3, 7], diminished: [0, 3, 6], augmented: [0, 4, 8] };
const mod12 = (n: number) => ((n % 12) + 12) % 12;
const unwrap = (raw: string) => raw.trim().replace(/^\((.*)\)$/, "$1");

function rootOf(raw: string): number | null {
  const parsed = parseChord(unwrap(raw));
  return parsed?.kind === "chord" ? semitoneOf(parsed.root) : null;
}

/**
 * The bass notes between two roots, a step at a time along the key's scale,
 * the shorter way round (down when it's as short): E♭ to B in D is D, C#.
 * Null when they're the same note, or more than four steps apart.
 */
function bassWalk(from: number, to: number, key: { tonic: number; minor: boolean }): number[] | null {
  if (from === to) return null;
  const scale = new Set((key.minor ? SCALES.minor : SCALES.major).map((step) => mod12(step + key.tonic)));
  const walk = (direction: 1 | -1) => {
    const notes: number[] = [];
    for (let note = mod12(from + direction); note !== to; note = mod12(note + direction)) if (scale.has(note)) notes.push(note);
    return notes;
  };
  const down = walk(-1);
  const up = walk(1);
  const notes = up.length < down.length ? up : down;
  return notes.length > 0 && notes.length <= 4 ? notes : null;
}

/**
 * A chord of the key over a bass note, as a bass line is usually harmonised:
 * I, V or IV with the note as its root or its third (C# in D: A/C#), else
 * vi, ii or iii on it (i, V, iv; VI, III, VII in minor), else any of them
 * with the note as its fifth. Never one of `avoid`. Null when none has it.
 */
function overBass(bass: number, key: string, minor: boolean, avoid: string[]): string | null {
  const diatonic = diatonicChords(key);
  const chordAt = (index: number) => {
    const chord = diatonic[index]?.chord;
    // The minor key's v as a major V: its leading note.
    return chord && minor && index === 4 ? chord.replace(/m$/, "") : chord;
  };
  const primary = [0, 4, 3];
  const secondary = minor ? [5, 2, 6] : [5, 1, 2];
  const tries: [number[], number[]][] = [
    [primary, [0, 1]],
    [secondary, [0]],
    [[...primary, ...secondary], [1, 2]],
  ];
  for (const [indexes, positions] of tries) {
    for (const index of indexes) {
      const chord = chordAt(index);
      const parsed = chord ? parseChord(chord) : null;
      if (!chord || parsed?.kind !== "chord" || avoid.some((other) => sameChord(other, chord))) continue;
      const root = semitoneOf(parsed.root);
      const tones = (TRIADS[parsed.quality] ?? TRIADS.major!).map((step) => mod12(root + step));
      const position = tones.indexOf(bass);
      if (!positions.includes(position)) continue;
      return position === 0 ? chord : `${chord}/${noteName(bass, key)}`;
    }
  }
  return null;
}

function noteName(semitone: number, key: string): string {
  return transposeChord("C", semitone, key);
}

/**
 * Ways from one song into the next, with `chords` chords each (any number
 * when left out). They go from the song's last chord (`lastChord`, as
 * played) into the next song's first (`firstChord`; its 1 when left out),
 * those that use the last chord first:
 * - walking-bass: the bass steps from one root to the other along the
 *   key's scale, each note under a chord of the key (E♭ to Bm in D:
 *   D, A/C#);
 * - walk-sus: the last chord over the bass's first step, then IV/V and V7
 *   of the key (E♭/D, G/A, A7 into Bm);
 * - key-dominant: into a first chord that isn't the key's 1, the key's own
 *   V7 landing on it (A7 into Bm), also after IV/V;
 * - dominant: the first chord's own V7 (into Bm, F#7);
 * - sus-dominant: that V7sus4 resolving to V7;
 * - two-five: ii7 V7 of the first chord (iiø7 V7 into a minor chord);
 * - four-five: IV V7 (iv V7);
 * - pivot: a chord of the old key the new one has too - still sounding like
 *   the song being left - then ii7 V7 (iv V7);
 * - step-up, a half or whole step up: bVI bVII;
 * - circle: down the circle of fifths, iii7 vi7 ii7 V7 (bIII bVI iiø7 V7).
 * Into the same key, from a song ending where the next starts: a turnaround
 * (two-five, four-five, circle). Degrees are always of the next song's key
 * (into its 6m, the first chord's dominant is "37"). Empty when either key
 * can't be read.
 */
export function transitionProgressions(
  fromKey: string | null | undefined,
  toKey: string | null | undefined,
  options: { chords?: number; firstChord?: string | null; lastChord?: string | null } = {},
): TransitionSuggestion[] {
  const from = readKey(fromKey);
  const key = readKey(toKey);
  if (!from || !key) return [];
  const target = targetKey(toKey!, options.firstChord);
  const to = readKey(target)!;
  const up = (((to.tonic - from.tonic) % 12) + 12) % 12;
  const sameKey = up === 0 && from.minor === to.minor;
  const two = to.minor ? "2m7b5" : "2m7";
  // Chords spelled in the next song's key, and degrees around the target chord (turned into the key's below).
  const spelled: { kind: TransitionKind; chords: string[] }[] = [];
  const local: { kind: TransitionKind; degrees: string[] }[] = [];

  // From the last chord: its bass walking into the first chord's.
  const lastRoot = options.lastChord ? rootOf(options.lastChord) : null;
  const firstChord = options.firstChord ? unwrap(options.firstChord) : (degreeChord(key.minor ? "1m" : "1", toKey) ?? null);
  const firstRoot = firstChord ? rootOf(firstChord) : null;
  if (lastRoot !== null && firstRoot !== null) {
    const walk = bassWalk(lastRoot, firstRoot, key);
    if (walk) {
      const chords: string[] = [];
      for (const bass of walk) {
        const chord = overBass(bass, toKey!, key.minor, [firstChord!, options.lastChord!, ...chords.slice(-1)]);
        if (!chord) break;
        chords.push(chord);
      }
      if (chords.length === walk.length) spelled.push({ kind: "walking-bass", chords });
      // The last chord held over the bass's first step, then the key's IV/V and V7.
      // (Not over the note a half step above its root: C over C# clashes, E♭ over D, its major 7th, doesn't.)
      if (!key.minor && mod12(walk[0]! - lastRoot) !== 1) {
        const held = simplifyChord(unwrap(options.lastChord!), { dropBass: true });
        spelled.push({ kind: "walk-sus", chords: [`${held}/${noteName(walk[0]!, toKey!)}`, ...degreeChords(["4/5", "57"], toKey)] });
      }
    }
  }
  // Into a first chord other than the key's 1: the key's dominant, landing there.
  if (firstChord && nashvilleChord(simplifyChord(firstChord, { dropExtensions: true, dropBass: true }), toKey).replace(/m$/, "") !== "1") {
    spelled.push({ kind: "key-dominant", chords: degreeChords(["57"], toKey) });
    if (!key.minor) spelled.push({ kind: "key-dominant", chords: degreeChords(["4/5", "57"], toKey) });
  }

  if (!sameKey) {
    local.push({ kind: "dominant", degrees: ["57"] });
    local.push({ kind: "sus-dominant", degrees: ["57sus4", "57"] });
  }
  local.push({ kind: "two-five", degrees: [two, "57"] });
  local.push({ kind: "four-five", degrees: [to.minor ? "4m" : "4", "57"] });
  if (!sameKey) {
    // A chord of the old key that the target has too, beyond the ii or IV the others already start on.
    const shared = diatonicChords(target)
      .map((chord) => chord.chord)
      .filter((chord) => diatonicChords(fromKey).some((other) => sameChord(other.chord, chord)))
      .map((chord) => nashvilleChord(chord, target));
    const pivot = (to.minor ? ["b6", "b3"] : ["6m", "3m"]).find((degree) => shared.includes(degree));
    if (pivot) local.push({ kind: "pivot", degrees: [pivot, to.minor ? "4m" : "2m7", "57"] });
    if (up === 1 || up === 2) local.push({ kind: "step-up", degrees: ["b6", "b7"] });
  }
  local.push({ kind: "circle", degrees: to.minor ? ["b3", "b6", "2m7b5", "57"] : ["3m7", "6m7", "2m7", "57"] });

  const all = [
    ...spelled.map((one) => ({ kind: one.kind, degrees: one.chords.map((chord) => nashvilleChord(chord, toKey)) })),
    // Worked out around the target chord; kept as degrees of the next song's key.
    ...local.map((one) => ({ kind: one.kind, degrees: target === toKey ? one.degrees : one.degrees.map((degree) => nashvilleChord(degreeChord(degree, target) ?? degree, toKey)) })),
  ];
  const seen = new Set<string>();
  return all
    .filter((one) => options.chords === undefined || one.degrees.length === options.chords)
    .filter((one) => !seen.has(one.degrees.join(" ")) && !!seen.add(one.degrees.join(" ")))
    .map((one) => ({ kind: one.kind, degrees: one.degrees, chords: degreeChords(one.degrees, toKey) }));
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
