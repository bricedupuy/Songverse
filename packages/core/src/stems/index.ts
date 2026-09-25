import { foldForSearch } from "../search-text/index.js";

/**
 * The parts a song's audio can be split into (issue #64): what the stem
 * player lists, in this order. Demucs's six (vocals, drums, bass, guitar,
 * piano, other) plus the tracks a band's multitracks usually add.
 */
export const STEM_PARTS = ["VOCALS", "BACKING_VOCALS", "DRUMS", "BASS", "GUITAR", "KEYS", "OTHER", "CLICK"] as const;
export type StemPart = (typeof STEM_PARTS)[number];

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
