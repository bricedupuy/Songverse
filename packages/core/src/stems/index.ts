import { foldForSearch } from "../search-text/index.js";

/**
 * The parts a song's audio can be split into (issue #64): what the stem
 * player lists, in this order. Demucs's six (vocals, drums, bass, guitar,
 * piano, other) plus the tracks a band's multitracks usually add.
 */
export const STEM_PARTS = ["VOCALS", "BACKING_VOCALS", "DRUMS", "BASS", "GUITAR", "KEYS", "OTHER", "CLICK"] as const;
export type StemPart = (typeof STEM_PARTS)[number];

/**
 * Parts with no pitch to move (issue #129): the drums, and the click and
 * cues. Transposing the stems leaves them alone unless asked.
 */
export const UNPITCHED_PARTS: readonly StemPart[] = ["DRUMS", "CLICK"];

/** Whether transposing moves this part: every part but the drums and cues - or every part at all, with `all`. */
export function transposesPart(part: StemPart | null, all = false): boolean {
  return all || part === null || !UNPITCHED_PARTS.includes(part);
}

export function isStemPart(value: unknown): value is StemPart {
  return typeof value === "string" && (STEM_PARTS as readonly string[]).includes(value);
}

// Whole words (a plural "s" allowed), as file names spell them: "Song - Vocals.mp3", "03 drums.opus", "no_vocals.wav".
const word = (...words: string[]) => new RegExp(`(?<![a-z])(?:${words.join("|")})s?(?![a-z])`);

// Checked in this order: "Bass drum" is drums, "Lead guitar" a guitar, "BV lead" backing vocals.
const RULES: [StemPart, RegExp][] = [
  ["CLICK", word("click", "clic", "metronome", "cue", "guide")],
  // Demucs's two-stem split names the rest "no_vocals".
  ["OTHER", /(?<![a-z])(?:no|without|sans|minus)[^a-z]*(?:vocals?|vox|voix)(?![a-z])/],
  ["BACKING_VOCALS", word("backing", "bv", "bgv", "bgvox", "choir", "choeur", "harmony", "harmonie", "harmonies", "background")],
  ["DRUMS", word("drum", "batterie", "kit", "perc", "percussion", "kick", "snare", "overhead", "tom", "hihat", "cymbal")],
  ["BASS", word("bass", "basse")],
  ["GUITAR", word("guitar", "guitare", "gtr", "egtr", "agtr")],
  ["KEYS", word("piano", "key", "keyboard", "clavier", "synth", "organ", "orgue", "pad", "rhodes", "wurli")],
  ["VOCALS", word("vocal", "vox", "voice", "voix", "voc", "chant", "lead", "singer")],
  ["OTHER", word("other", "autre", "instrumental", "accompaniment", "rest")],
];

/** The part a file's name says it is ("Morning Light - Vocals.opus" is VOCALS), or null. */
export function stemPartFromFilename(filename: string): StemPart | null {
  const name = foldForSearch(filename.replace(/\.[a-z0-9]{1,5}$/i, "")).replace(/_/g, " ");
  for (const [part, pattern] of RULES) if (pattern.test(name)) return part;
  return null;
}

/** File types the stem player plays: MP3 and Opus (in Ogg or WebM), plus the usual lossless and AAC files. */
export const STEM_FILE_EXTENSIONS = [".mp3", ".opus", ".ogg", ".oga", ".webm", ".m4a", ".aac", ".wav", ".flac"] as const;

/** An audio file by its extension, for browsers that give .opus files no type. */
export function isAudioFilename(filename: string): boolean {
  const lower = filename.toLowerCase();
  return STEM_FILE_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

/** What grouping needs of an audio file (the API's attachment has it all). */
export interface MultitrackFile {
  type: string;
  stemPart: StemPart | null;
  filename: string;
  createdAt: string;
  multitrackId?: string | null;
  multitrackName?: string | null;
  multitrackSetlistId?: string | null;
  otherTake?: boolean;
}

/** A song's multitrack (issue #123): the parts recorded together, played together. */
export interface Multitrack<F extends MultitrackFile = MultitrackFile> {
  /** Null: the song's original stems. */
  id: string | null;
  /** As its files give it, or null (the app names it). */
  name: string | null;
  /** In the player's order: by part, then by name. */
  files: F[];
  /** Other takes of its parts, kept but not played (issue #127), newest first. */
  otherTakes: F[];
  /** The set it was recorded for, if any. */
  setlistId: string | null;
}

const byPart = (a: MultitrackFile, b: MultitrackFile) =>
  STEM_PARTS.indexOf(a.stemPart ?? "OTHER") - STEM_PARTS.indexOf(b.stemPart ?? "OTHER") || a.filename.localeCompare(b.filename);

/**
 * A song's multitracks: its audio files with a part, or in a multitrack,
 * grouped by multitrack - the original stems first, then the others in
 * the order they were started. A whole recording (no part, no multitrack)
 * is in none.
 */
export function multitracksOf<F extends MultitrackFile>(files: F[]): Multitrack<F>[] {
  const groups = new Map<string | null, F[]>();
  for (const file of files) {
    if (file.type !== "AUDIO" || (file.stemPart === null && !file.multitrackId)) continue;
    const id = file.multitrackId ?? null;
    groups.set(id, [...(groups.get(id) ?? []), file]);
  }
  const started = (group: F[]) => group.reduce((first, file) => (file.createdAt < first ? file.createdAt : first), group[0]!.createdAt);
  return [...groups.entries()]
    .sort(([a, x], [b, y]) => (a === null ? -1 : b === null ? 1 : started(x).localeCompare(started(y))))
    .map(([id, group]) => ({
      id,
      name: group.find((file) => file.multitrackName)?.multitrackName ?? null,
      files: group.filter((file) => !file.otherTake).sort(byPart),
      otherTakes: group.filter((file) => file.otherTake).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
      setlistId: group.find((file) => file.multitrackSetlistId)?.multitrackSetlistId ?? null,
    }));
}

/** A fresh multitrack id, for the first file of a new one. */
export function newMultitrackId(): string {
  const bytes = new Uint8Array(12);
  globalThis.crypto.getRandomValues(bytes);
  return `mt${[...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}
