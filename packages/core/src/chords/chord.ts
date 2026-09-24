/**
 * Chord symbols: reading them ("F#m7b5/C#", "Cadd9", "N.C."), transposing
 * them, naming them in solfège and simplifying them.
 *
 * A song stores each chord exactly as written (`raw`); everything here is
 * derived from that on demand, so an improvement to the parser applies to
 * every song at once, with nothing stored to go stale. Transposing and
 * renaming only touch the root and bass notes - the rest of the symbol
 * ("m7b5", "sus4", "(add9)") is kept as the author wrote it.
 */

export type NoteLetter = "C" | "D" | "E" | "F" | "G" | "A" | "B";
export type NoteAccidental = "sharp" | "flat";

export interface NoteName {
  letter: NoteLetter;
  accidental: NoteAccidental | null;
}

export type ParsedChordQuality = "major" | "minor" | "diminished" | "augmented" | "half-diminished" | "sus2" | "sus4" | "power";

export interface ParsedChord {
  kind: "chord";
  root: NoteName;
  quality: ParsedChordQuality;
  /** The seventh, if any: minor (C7, Cm7), major (Cmaj7) or diminished (Cdim7). */
  seventh: "minor" | "major" | "diminished" | null;
  /** Added and extended tones, in order: "6", "9", "11", "13", "add9", "add2"... */
  extensions: string[];
  /** Altered tones: "b5", "#5", "b9", "#9", "#11", "b13", or "alt". */
  alterations: string[];
  bass: NoteName | null;
  /** Written in parentheses, e.g. "(G)": play it if you like. */
  optional: boolean;
}

/** "N.C." - no chord: the band stops. */
export interface NoChord {
  kind: "no-chord";
  optional: boolean;
}

const LETTER_SEMITONES: Record<NoteLetter, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const SHARP_SPELLING: NoteName[] = [
  { letter: "C", accidental: null },
  { letter: "C", accidental: "sharp" },
  { letter: "D", accidental: null },
  { letter: "D", accidental: "sharp" },
  { letter: "E", accidental: null },
  { letter: "F", accidental: null },
  { letter: "F", accidental: "sharp" },
  { letter: "G", accidental: null },
  { letter: "G", accidental: "sharp" },
  { letter: "A", accidental: null },
  { letter: "A", accidental: "sharp" },
  { letter: "B", accidental: null },
];
const FLAT_SPELLING: NoteName[] = [
  { letter: "C", accidental: null },
  { letter: "D", accidental: "flat" },
  { letter: "D", accidental: null },
  { letter: "E", accidental: "flat" },
  { letter: "E", accidental: null },
  { letter: "F", accidental: null },
  { letter: "G", accidental: "flat" },
  { letter: "G", accidental: null },
  { letter: "A", accidental: "flat" },
  { letter: "A", accidental: null },
  { letter: "B", accidental: "flat" },
  { letter: "B", accidental: null },
];
// Major keys written with flats (F, Bb, Eb, Ab, Db, Gb); a minor key follows its relative major.
const FLAT_MAJOR_KEYS = new Set([5, 10, 3, 8, 1, 6]);

const NOTE = "([A-G])([#♯b♭]?)";
const NO_CHORD = /^(n\.?\s?c\.?|n\/c)$/i;

/** The pieces of a chord symbol: root, the rest as written, and the bass note. */
interface ChordParts {
  optional: boolean;
  root: NoteName;
  suffix: string;
  bass: NoteName | null;
}

function toNote(letter: string, accidental: string): NoteName {
  return {
    letter: letter as NoteLetter,
    accidental: accidental === "#" || accidental === "♯" ? "sharp" : accidental === "b" || accidental === "♭" ? "flat" : null,
  };
}

function splitChord(raw: string): ChordParts | null {
  let text = raw.trim();
  let optional = false;
  if (text.startsWith("(") && text.endsWith(")")) {
    optional = true;
    text = text.slice(1, -1).trim();
  }
  const match = new RegExp(`^${NOTE}(.*?)(?:/${NOTE})?$`).exec(text);
  if (!match) return null;
  const [, rootLetter, rootAccidental, suffix, bassLetter, bassAccidental] = match;
  return {
    optional,
    root: toNote(rootLetter!, rootAccidental!),
    suffix: suffix ?? "",
    bass: bassLetter ? toNote(bassLetter, bassAccidental ?? "") : null,
  };
}

/**
 * Reads a chord symbol. Returns null for anything it can't fully make sense
 * of (the raw text is still shown as written); `noChord` covers "N.C.".
 */
export function parseChord(raw: string): ParsedChord | NoChord | null {
  const trimmed = raw.trim();
  const optional = trimmed.startsWith("(") && trimmed.endsWith(")");
  if (NO_CHORD.test(optional ? trimmed.slice(1, -1).trim() : trimmed)) return { kind: "no-chord", optional };

  const parts = splitChord(raw);
  if (!parts) return null;
  const suffix = parseSuffix(parts.suffix);
  if (!suffix) return null;
  return { kind: "chord", root: parts.root, ...suffix, bass: parts.bass, optional: parts.optional };
}

function parseSuffix(input: string): Pick<ParsedChord, "quality" | "seventh" | "extensions" | "alterations"> | null {
  let rest = input.replace(/\s+/g, "");
  let quality: ParsedChordQuality = "major";
  let seventh: ParsedChord["seventh"] = null;
  const extensions: string[] = [];
  const alterations: string[] = [];
  const take = (pattern: RegExp): RegExpExecArray | null => {
    const match = pattern.exec(rest);
    if (match) rest = rest.slice(match[0].length);
    return match;
  };
  // A degree beyond the seventh implies the seventh (C9 = C7 + 9).
  const extend = (degree: string | undefined) => {
    if (degree && degree !== "7") extensions.push(degree);
  };

  // The triad.
  if (take(/^[øØ]7?/)) {
    quality = "half-diminished";
    seventh = "minor";
  } else if (take(/^(?:m7b5|m7\(b5\)|min7b5|-7b5)/)) {
    quality = "half-diminished";
    seventh = "minor";
  } else if (take(/^(?:dim|°|o)/)) {
    quality = "diminished";
    if (take(/^7/)) seventh = "diminished";
  } else if (take(/^(?:aug|\+)/)) {
    quality = "augmented";
  } else if (take(/^(?:min|mi(?!n)|m(?!aj|a\d)|-)/)) {
    quality = "minor";
  } else if (/^5$/.test(rest)) {
    rest = "";
    quality = "power";
  }

  // The seventh and extensions.
  const major = take(/^\(?(?:maj|Maj|MAJ|ma|M|Δ|△)(7|9|11|13)?\)?/);
  if (major) {
    if (major[1]) {
      seventh = "major";
      extend(major[1]);
    }
  } else {
    const sixNine = take(/^6(?:\/?9)?/);
    if (sixNine) {
      extensions.push("6");
      if (sixNine[0].length > 1) extensions.push("9");
    }
    const degree = take(/^(7|9|11|13)/);
    if (degree) {
      if (quality !== "half-diminished" && seventh === null) seventh = "minor";
      extend(degree[1]);
    }
  }

  // Suspensions, additions and alterations, in any order.
  for (let progress = true; progress && rest.length > 0; ) {
    progress = false;
    const sus = take(/^\(?sus(2|4)?\)?/);
    if (sus) {
      quality = sus[1] === "2" ? "sus2" : "sus4";
      progress = true;
      continue;
    }
    const add = take(/^\(?add(2|4|9|11|13)\)?/);
    if (add) {
      extensions.push(`add${add[1]}`);
      progress = true;
      continue;
    }
    const alteration = take(/^\(?([#♯b♭+-])(5|9|11|13)\)?/);
    if (alteration) {
      const sign = alteration[1] === "#" || alteration[1] === "♯" || alteration[1] === "+" ? "#" : "b";
      alterations.push(`${sign}${alteration[2]}`);
      progress = true;
      continue;
    }
    if (take(/^alt/)) {
      alterations.push("alt");
      progress = true;
      continue;
    }
    // "C2": the second added (a common worship-chart shorthand).
    if (take(/^\(?2\)?/)) {
      extensions.push("add2");
      progress = true;
    }
  }

  return rest.length === 0 ? { quality, seventh, extensions, alterations } : null;
}

function semitoneOf(note: NoteName): number {
  return mod12(LETTER_SEMITONES[note.letter] + (note.accidental === "sharp" ? 1 : note.accidental === "flat" ? -1 : 0));
}

function noteText(note: NoteName, notation: ChordNotation = "english"): string {
  const name = notation === "solfege" ? SOLFEGE[note.letter] : note.letter;
  return name + (note.accidental === "sharp" ? "#" : note.accidental === "flat" ? "b" : "");
}

function rebuild(parts: ChordParts, notation: ChordNotation = "english"): string {
  const text = noteText(parts.root, notation) + parts.suffix + (parts.bass ? `/${noteText(parts.bass, notation)}` : "");
  return parts.optional ? `(${text})` : text;
}

/** Whether keys like this one are written with flats (F, Bb, Dm...). Null/unknown keys use sharps. */
export function keyUsesFlats(key: string | null | undefined): boolean {
  const match = key ? /^\s*([A-G])([#♯b♭]?)\s*(m(?!aj)|min|minor|-)?/i.exec(key) : null;
  if (!match) return false;
  const tonic = semitoneOf(toNote(match[1]!.toUpperCase(), match[2]!));
  const relativeMajor = match[3] ? mod12(tonic + 3) : tonic;
  return FLAT_MAJOR_KEYS.has(relativeMajor);
}

/**
 * The chord `steps` semitones up (or down, if negative), spelled for
 * `targetKey` (flats in F, Bb...; sharps otherwise). Only the root and bass
 * change. Anything that isn't a chord symbol comes back unchanged.
 */
export function transposeChord(raw: string, steps: number, targetKey?: string | null): string {
  const parts = splitChord(raw);
  if (!parts || mod12(steps) === 0) return raw;
  const spelling = keyUsesFlats(targetKey) ? FLAT_SPELLING : SHARP_SPELLING;
  const move = (note: NoteName) => spelling[mod12(semitoneOf(note) + steps)]!;
  return rebuild({ ...parts, root: move(parts.root), bass: parts.bass ? move(parts.bass) : null });
}

export interface DiatonicChord {
  /** The chord's degree in the key: "I", "ii", "vii°" (major), "i", "III" (minor). */
  degree: string;
  chord: string;
}

const MAJOR_SCALE: [number, string, string][] = [
  [0, "", "I"],
  [2, "m", "ii"],
  [4, "m", "iii"],
  [5, "", "IV"],
  [7, "", "V"],
  [9, "m", "vi"],
  [11, "dim", "vii°"],
];
const MINOR_SCALE: [number, string, string][] = [
  [0, "m", "i"],
  [2, "dim", "ii°"],
  [3, "", "III"],
  [5, "m", "iv"],
  [7, "m", "v"],
  [8, "", "VI"],
  [10, "", "VII"],
];

/**
 * The seven chords built on the key's scale, in order (G: G Am Bm C D Em
 * F#dim; Em: Em F#dim G Am Bm C D), spelled for the key. Empty for a key
 * it can't read.
 */
export function diatonicChords(key: string | null | undefined): DiatonicChord[] {
  const match = key ? /^\s*([A-G])([#♯b♭]?)\s*(m(?!aj)|min|minor|-)?\s*$/i.exec(key) : null;
  if (!match) return [];
  const tonic = semitoneOf(toNote(match[1]!.toUpperCase(), match[2]!));
  const spelling = keyUsesFlats(key) ? FLAT_SPELLING : SHARP_SPELLING;
  return (match[3] ? MINOR_SCALE : MAJOR_SCALE).map(([interval, suffix, degree]) => ({
    degree,
    chord: noteText(spelling[mod12(tonic + interval)]!) + suffix,
  }));
}

export type ChordNotation = "english" | "solfege";
const SOLFEGE: Record<NoteLetter, string> = { C: "Do", D: "Ré", E: "Mi", F: "Fa", G: "Sol", A: "La", B: "Si" };

/** The chord with its notes named for `notation` ("Sol/Si" for "G/B" in solfège). */
export function formatChord(raw: string, notation: ChordNotation): string {
  if (notation === "english") return raw;
  const parts = splitChord(raw);
  return parts ? rebuild(parts, notation) : raw;
}

export interface SimplifyOptions {
  /** Keep only the triad: Gmaj7 -> G, Em7 -> Em, Bm7b5 -> Bdim, Csus4 stays. */
  dropExtensions?: boolean;
  /** Drop the bass note of a slash chord: D/F# -> D. */
  dropBass?: boolean;
}

/** A simpler version of the chord for a player who wants fewer changes to read. */
export function simplifyChord(raw: string, options: SimplifyOptions): string {
  const parts = splitChord(raw);
  const parsed = parseChord(raw);
  if (!parts || !parsed || parsed.kind !== "chord") return raw;
  const triad: Record<ParsedChordQuality, string> = {
    major: "",
    minor: "m",
    diminished: "dim",
    "half-diminished": "dim",
    augmented: "aug",
    sus2: "sus2",
    sus4: "sus4",
    power: "5",
  };
  return rebuild({
    ...parts,
    suffix: options.dropExtensions ? triad[parsed.quality] : parts.suffix,
    bass: options.dropBass ? null : parts.bass,
  });
}

/** Whether two chord symbols sound the same (same notes, however they're spelled or written). */
export function sameChord(a: string, b: string): boolean {
  if (a.trim() === b.trim()) return true;
  const [x, y] = [parseChord(a), parseChord(b)];
  if (!x || !y || x.kind !== y.kind) return false;
  if (x.kind === "no-chord" || y.kind === "no-chord") return true;
  return (
    semitoneOf(x.root) === semitoneOf(y.root) &&
    x.quality === y.quality &&
    x.seventh === y.seventh &&
    x.extensions.join() === y.extensions.join() &&
    x.alterations.join() === y.alterations.join() &&
    (x.bass ? semitoneOf(x.bass) : -1) === (y.bass ? semitoneOf(y.bass) : -1)
  );
}

function mod12(value: number): number {
  return ((value % 12) + 12) % 12;
}
