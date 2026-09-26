import { generateId, ID_PREFIXES } from "../ids/index.js";
import type { ChordV2 } from "../schemas/song-document-v2.js";

/**
 * One line with its chords in brackets, as typed: "[G]Sing it a[D]gain".
 * How a line added to a version (#24) is written and edited.
 */
export function chordLineToText(line: { text: string; chords: { at: number; raw: string }[] }): string {
  const chords = [...line.chords].sort((a, b) => a.at - b.at);
  let out = "";
  let from = 0;
  for (const chord of chords) {
    const at = Math.min(chord.at, line.text.length);
    out += line.text.slice(from, at) + `[${chord.raw}]`;
    from = Math.max(from, at);
  }
  return out + line.text.slice(from);
}

/**
 * The line typed in brackets, as words and chords. Chords keep the IDs of
 * `previous` in order (the first chord keeps the first one's ID, and so on),
 * so what points at them - a replaced or hidden chord - still does; new ones
 * get `newId()`.
 */
export function chordLineFromText(
  input: string,
  previous: { id: string }[] = [],
  newId: () => string = () => generateId(ID_PREFIXES.insertedChord),
): { text: string; chords: ChordV2[] } {
  const chords: ChordV2[] = [];
  let text = "";
  const re = /\[([^\]]*)\]/g;
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(input)) !== null) {
    text += input.slice(last, match.index);
    last = re.lastIndex;
    const raw = match[1]!.trim();
    if (!raw) continue;
    chords.push({ id: previous[chords.length]?.id ?? newId(), at: text.length, raw });
  }
  text += input.slice(last);
  return { text, chords };
}
