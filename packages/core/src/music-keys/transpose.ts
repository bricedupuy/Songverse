const SHARP_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"] as const;
const FLAT_NAMES = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"] as const;
const LETTER_SEMITONES: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
// Major keys conventionally written with flats (F, Bb, Eb, Ab, Db); minor
// keys follow their relative major. Everything else is spelled with sharps.
const FLAT_MAJOR_SEMITONES = new Set([5, 10, 3, 8, 1]);

export interface ParsedKey {
  /** 0 = C ... 11 = B */
  semitone: number;
  minor: boolean;
}

/** Parses free-text keys like "G", "Bb", "C#m", "F# minor", "Ebmaj". Returns null when unrecognized. */
export function parseKey(text: string): ParsedKey | null {
  const match = /^\s*([A-Ga-g])\s*([#♯b♭]?)\s*(maj(?:or)?|m(?:in(?:or)?)?|-)?\s*$/i.exec(text);
  if (!match) return null;
  const [, letter, accidental, quality] = match;
  const base = LETTER_SEMITONES[letter!.toUpperCase()]!;
  const shift = accidental === "#" || accidental === "♯" ? 1 : accidental === "b" || accidental === "♭" ? -1 : 0;
  const minor = !!quality && !/^maj/i.test(quality);
  return { semitone: mod12(base + shift), minor };
}

export function formatKey({ semitone, minor }: ParsedKey): string {
  const relativeMajor = minor ? mod12(semitone + 3) : semitone;
  const names = FLAT_MAJOR_SEMITONES.has(relativeMajor) ? FLAT_NAMES : SHARP_NAMES;
  return `${names[mod12(semitone)]}${minor ? "m" : ""}`;
}

/** The key `steps` semitones away from `key`, conventionally spelled; null if `key` isn't recognized. */
export function transposeKey(key: string, steps: number): string | null {
  const parsed = parseKey(key);
  return parsed ? formatKey({ semitone: mod12(parsed.semitone + steps), minor: parsed.minor }) : null;
}

/**
 * The twelve distinct transpositions, as semitone offsets from -5 to +6 -
 * each target key once, reached by the smaller move.
 */
export const TRANSPOSE_STEP_OPTIONS = [-5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5, 6] as const;

function mod12(value: number): number {
  return ((value % 12) + 12) % 12;
}
