import type { SongDocumentV2 } from "../schemas/song-document-v2.js";
import { foldForSearch } from "./index.js";

/**
 * Finding a song by its words (issue #221): "the one that goes *my chains
 * are gone*". The API, offline search and the native apps match and pick
 * the line the same way, with these.
 */

/** A sung line, as the chart has it, and its id (to open the song at it). */
export interface LyricsLine {
  id: string;
  text: string;
}

/** The fewest letters a lyrics search takes: shorter matches half the songs. */
export const LYRICS_QUERY_MIN_LETTERS = 3;

/**
 * A song's sung lines in order: no chords, no notes for the band, no empty
 * lines; a line sung again (a chorus written out twice) only the first time.
 */
export function lyricsLines(document: Pick<SongDocumentV2, "sections">): LyricsLine[] {
  const seen = new Set<string>();
  const lines: LyricsLine[] = [];
  for (const section of document.sections) {
    for (const line of section.lines) {
      if (line.kind === "note") continue;
      const text = line.text.replace(/\s+/g, " ").trim();
      const key = foldLyrics(text).text;
      if (!key || seen.has(key)) continue;
      seen.add(key);
      lines.push({ id: line.id, text });
    }
  }
  return lines;
}

/**
 * What the database keeps to find a song by its words (`SongVersion.lyricsText`):
 * its sung lines folded as a search compares them, one per line.
 */
export function lyricsSearchText(document: Pick<SongDocumentV2, "sections">): string {
  return lyricsLines(document)
    .map((line) => foldLyrics(line.text).text)
    .join("\n");
}

/**
 * Text as a lyrics search compares it: as every search does (case,
 * accents and ligatures - foldForSearch), apostrophes left out ("I've" is
 * "ive") and other punctuation a space, spaces run together. `at` gives
 * each folded character's place in the text it came from.
 */
export function foldLyrics(text: string): { text: string; at: number[] } {
  let folded = "";
  const at: number[] = [];
  let index = 0;
  for (const char of text) {
    let piece = foldForSearch(char);
    if (/^['’ʼ`´]$/u.test(piece)) piece = "";
    else if (/[^\p{L}\p{N}]/u.test(piece)) piece = " ";
    for (const out of piece) {
      if (out === " " && (folded === "" || folded.endsWith(" "))) continue;
      folded += out;
      at.push(index);
    }
    index += char.length;
  }
  if (folded.endsWith(" ")) {
    folded = folded.slice(0, -1);
    at.pop();
  }
  return { text: folded, at };
}

/**
 * A lyrics search as typed: its words, and its phrases in quotes, folded;
 * null when it has fewer than three letters in all.
 */
export function parseLyricsQuery(query: string): string[] | null {
  const terms: string[] = [];
  const rest = query.replace(/["“”«»]([^"“”«»]*)["“”«»]?/gu, (_, phrase: string) => {
    const folded = foldLyrics(phrase).text;
    if (folded) terms.push(folded);
    return " ";
  });
  for (const word of foldLyrics(rest).text.split(" ")) if (word) terms.push(word);
  const letters = terms.join("").replace(/\s/g, "").length;
  return terms.length > 0 && letters >= LYRICS_QUERY_MIN_LETTERS ? terms : null;
}

/** Where a search found a song's words: its line, and the words found (ranges of the line's text). */
export interface LyricsMatch {
  /** The line's index among those given. */
  index: number;
  lineId: string | null;
  text: string;
  /** [start, end) in `text`, one per word or phrase searched. */
  found: [number, number][];
}

/**
 * The line that best matches a lyrics search, or null: one with every word
 * and phrase searched, in that order (not necessarily next to each other);
 * of those, the one where they're closest together, then the first.
 */
export function matchLyrics(query: string | string[], lines: { id?: string | null; text: string }[]): LyricsMatch | null {
  const terms = typeof query === "string" ? parseLyricsQuery(query) : query;
  if (!terms || terms.length === 0) return null;
  let best: (LyricsMatch & { spread: number }) | null = null;
  for (const [index, line] of lines.entries()) {
    const folded = foldLyrics(line.text);
    const spans: [number, number][] = [];
    let from = 0;
    for (const term of terms) {
      const start = folded.text.indexOf(term, from);
      if (start === -1) break;
      spans.push([start, start + term.length]);
      from = start + term.length;
    }
    if (spans.length < terms.length) continue;
    const spread = spans.at(-1)![1] - spans[0]![0];
    if (best && best.spread <= spread) continue;
    // Back to the line's own characters: from the first folded one's to past the last one's.
    const found = spans.map(([start, end]): [number, number] => {
      const last = folded.at[end - 1]!;
      return [folded.at[start]!, last + (line.text.codePointAt(last)! > 0xffff ? 2 : 1)];
    });
    best = { index, lineId: line.id ?? null, text: line.text, found, spread };
  }
  if (!best) return null;
  return { index: best.index, lineId: best.lineId, text: best.text, found: best.found };
}
