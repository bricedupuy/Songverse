import { chordFamily, diatonicChords, nashvilleChord, parseChord, sameChord, semitoneOf, simplifyChord, transposeChord, type NoteLetter } from "./chord.js";

/**
 * Chord progressions between two songs of a set (issue #10, phase 6 of
 * #207): a few ways from the end of one song into the first chord of the
 * next (issue #217) - its dominant, a ii-V, a chord both keys share - kept
 * as degrees of the next song's key, so they stay right when it's moved.
 */

export type TransitionKind = "dominant" | "two-five" | "sus-dominant" | "altered" | "diminished" | "pivot" | "chromatic-bass" | "backdoor" | "stacked";

/** One way to play a transition: its chords, between the song's last chord and the next one's first. */
export interface TransitionForm {
  /** The chords as degrees of the next song's key: ["2m7", "57"]. */
  degrees: string[];
  /** The same chords spelled in that key: ["Em7", "A7"]. */
  chords: string[];
}

/** A strategy for getting into the next song (issue #218): its usual form, and others like it. */
export interface TransitionSuggestion extends TransitionForm {
  kind: TransitionKind;
  /** One of the three a band would reach for first: V7 → I, ii → V → I, V7sus → V7 → I. */
  recommended: boolean;
  variations: TransitionForm[];
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
 * The ways from one song into the next (issues #10, #217, #218): from the
 * song's last chord (`lastChord`, as played) into the next song's first
 * (`firstChord`; its 1 when left out) - its "I" below - each a strategy
 * with its usual form and variations:
 * - dominant ★: V7 → I (A7 → D; A9, A13, A7♭9). Into a first chord that
 *   isn't the key's 1, also the key's own V7 landing on it (A7 → Bm,
 *   G/A A7 → Bm);
 * - two-five ★: ii7 V7 → I (Em7 A7; Em9 A13, Em7 A7♭9; iiø7 into minor);
 * - sus-dominant ★: V7sus4 V7 → I (A9sus4 A7♭9);
 * - altered: V7♭9 → I (A7♯5, A7♯9);
 * - diminished: vii°7 → I, voices moving by half steps (C#°7; C#°7 A7);
 * - pivot: a chord of both keys, heard in the old one and then the new
 *   (C → G → D; G A7);
 * - chromatic-bass: the bass down by half steps from the last chord to V7
 *   (C → C/B → B♭ → A7); or along the scale into the first chord
 *   (E♭ → D → A/C# → Bm); or the last chord over the bass's first step,
 *   then IV/V V7 (E♭/D G/A A7);
 * - backdoor, into a major chord: iv7 ♭VII7 → I (Gm7 C7; C7);
 * - stacked: the bass walking to V, then V9sus4 V7♭9 (C → G/B → A9sus4 →
 *   A7♭9 → D).
 * `fast` keeps the one-chord forms. Degrees are always of the next song's
 * key (into its 6m, the first chord's V7 is "37"). Empty when either key
 * can't be read.
 */
export function transitionProgressions(
  fromKey: string | null | undefined,
  toKey: string | null | undefined,
  options: { fast?: boolean; firstChord?: string | null; lastChord?: string | null } = {},
): TransitionSuggestion[] {
  const from = readKey(fromKey);
  const key = readKey(toKey);
  if (!from || !key) return [];
  const target = targetKey(toKey!, options.firstChord);
  const to = readKey(target)!;
  const sameKey = to.tonic === from.tonic && from.minor === to.minor;
  // Degrees around the first chord, or chords spelled: both as degrees of the next song's key.
  // (A diminished chord leads up a half step: spelled from below - A#°7 into B, not B♭°7.)
  const SHARPER: Record<string, string> = { b2: "#1", b3: "#2", b5: "#4", b6: "#5", b7: "#6" };
  const around = (...degrees: string[]) =>
    degrees.map((degree) => {
      const written = nashvilleChord(degreeChord(degree, target) ?? degree, toKey);
      const flat = /^(b[2-7])(dim.*)$/.exec(written);
      return flat ? SHARPER[flat[1]!]! + flat[2] : written;
    });
  const spelled = (...chords: string[]) => chords.map((chord) => nashvilleChord(chord, toKey));
  const strategies: { kind: TransitionKind; forms: string[][] }[] = [];

  const firstChord = options.firstChord ? unwrap(options.firstChord) : (degreeChord(key.minor ? "1m" : "1", toKey) ?? null);
  const firstRoot = firstChord ? rootOf(firstChord) : null;
  const intoKeyTonic = !firstChord || nashvilleChord(simplifyChord(firstChord, { dropExtensions: true, dropBass: true }), toKey).replace(/m$/, "") === "1";
  const lastChord = options.lastChord ? unwrap(options.lastChord) : null;
  const lastRoot = lastChord ? rootOf(lastChord) : null;
  const held = lastChord ? simplifyChord(lastChord, { dropBass: true }) : null;
  const dominantRoot = mod12(to.tonic + 7);

  strategies.push({
    kind: "dominant",
    forms: [around("57"), around("59"), around("513"), around("57b9"), ...(intoKeyTonic ? [] : [["57"], ...(key.minor ? [] : [["4/5", "57"]])])],
  });
  strategies.push({
    kind: "two-five",
    forms: to.minor ? [around("2m7b5", "57"), around("2m7b5", "57b9")] : [around("2m7", "57"), around("2m9", "513"), around("2m7", "57b9")],
  });
  strategies.push({ kind: "sus-dominant", forms: [around("57sus4", "57"), around("59sus4", "57b9")] });
  strategies.push({ kind: "altered", forms: [around("57b9"), around("57#5"), around("57#9")] });
  strategies.push({ kind: "diminished", forms: [around("7dim7"), around("7dim7", "57")] });

  if (!sameKey) {
    // A chord both keys have - not the first chord itself, nor the one just played.
    const targetChords = diatonicChords(target).map((chord) => chord.chord);
    const shared = targetChords.filter(
      (chord) => diatonicChords(fromKey).some((other) => sameChord(other.chord, chord)) && !sameChord(chord, target) && !(lastChord && sameChord(chord, held!)),
    );
    const rank = to.minor ? ["4m", "b6", "b3", "b7", "5m"] : ["4", "2m", "6m", "3m", "5"];
    const pivot = rank.map((degree) => shared.find((chord) => nashvilleChord(chord, target) === degree)).find(Boolean);
    if (pivot) strategies.push({ kind: "pivot", forms: [spelled(pivot), [...spelled(pivot), ...around("57")]] });
  }

  if (lastRoot !== null && held) {
    const forms: string[][] = [];
    // Down by half steps from the last chord's root to the dominant's: C, C/B, B♭, A7.
    const down = mod12(lastRoot - dominantRoot);
    if (down >= 2 && down <= 4) {
      const notes = Array.from({ length: down - 1 }, (_, i) => mod12(lastRoot - 1 - i));
      const chords = notes.map((note, i) =>
        i === 0 ? `${held}/${noteName(note, target)}` : (overBass(note, target, to.minor, [held]) ?? noteName(note, target)),
      );
      forms.push([...spelled(...chords), ...around("57")]);
    }
    // Along the scale straight into the first chord: E♭, D, A/C#, Bm.
    const walk = firstRoot !== null ? bassWalk(lastRoot, firstRoot, key) : null;
    if (walk) {
      const chords: string[] = [];
      for (const bass of walk) {
        const chord = overBass(bass, toKey!, key.minor, [firstChord!, lastChord!, ...chords.slice(-1)]);
        if (!chord) break;
        chords.push(chord);
      }
      if (chords.length === walk.length) forms.push(spelled(...chords));
      // The last chord held over the bass's first step, then IV/V and V7 of the key.
      // (Not over the note a half step above its root: C over C# clashes, E♭ over D, its major 7th, doesn't.)
      if (!key.minor && mod12(walk[0]! - lastRoot) !== 1) forms.push([...spelled(`${held}/${noteName(walk[0]!, toKey!)}`), "4/5", "57"]);
    }
    if (forms.length > 0) strategies.push({ kind: "chromatic-bass", forms });
  }

  if (!to.minor) strategies.push({ kind: "backdoor", forms: [around("4m7", "b77"), around("b77")] });

  // Stacked: the bass walking to the dominant's root, then its sus and its altered form.
  if (lastRoot !== null && held) {
    const walk = bassWalk(lastRoot, dominantRoot, to);
    const chords = (walk ?? []).map((note) => overBass(note, target, to.minor, [held]));
    if (walk && walk.length <= 3 && chords.every(Boolean)) strategies.push({ kind: "stacked", forms: [[...spelled(...(chords as string[])), ...around("59sus4", "57b9")]] });
  }

  const form = (degrees: string[]): TransitionForm => ({ degrees, chords: degreeChords(degrees, toKey) });
  const result: TransitionSuggestion[] = [];
  for (const { kind, forms } of strategies) {
    const seen = new Set<string>();
    const unique = forms.filter((one) => !seen.has(one.join(" ")) && !!seen.add(one.join(" ")));
    const kept = options.fast ? unique.filter((one) => one.length === 1) : unique;
    if (kept.length === 0) continue;
    result.push({ kind, recommended: kind === "dominant" || kind === "two-five" || kind === "sus-dominant", ...form(kept[0]!), variations: kept.slice(1).map(form) });
  }
  return result;
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
