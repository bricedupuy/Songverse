import type { SupportedImportFormat } from "../constants/index.js";
import { isChordLine } from "../chords-over-lyrics/parser.js";

/**
 * Guesses whether pasted text is ChordPro or chords-over-lyrics, so the
 * paste-import UI can preselect the right format instead of making the
 * user pick every time (they can still override it).
 *
 * Scans line by line for the first decisive signal:
 *  - a `{directive}` line, or inline `[Chord]` markup mixed into a line
 *    that also has real lyric text - ChordPro's own conventions.
 *  - a line that's nothing but chord tokens (chords-over-lyrics' chord
 *    line, meant to sit above the lyric line).
 * Falls back to ChordPro when nothing decisive is found - a chord-less
 * plain-text paste parses the same way under either format.
 */
export function detectImportFormat(text: string): SupportedImportFormat {
  for (const rawLine of text.split(/\r\n|\r|\n/)) {
    const trimmed = rawLine.trim();
    if (trimmed === "") continue;

    if (/^\{[^{}]+\}$/.test(trimmed)) return "CHORDPRO";
    if (/\[[^\]]+\]/.test(trimmed) && !isChordLine(trimmed)) return "CHORDPRO";
    if (isChordLine(trimmed)) return "CHORDS_OVER_LYRICS";
  }
  return "CHORDPRO";
}
