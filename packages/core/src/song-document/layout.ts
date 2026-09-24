/**
 * How a line of lyrics with chords is laid out for display, chords above
 * the characters they're pinned to (docs/song-document-v2.md, "Rendering
 * chords above lyrics"). Pure data, so the web and mobile apps draw it the
 * same way.
 *
 * A line becomes words; a word is the cells that must stay together on one
 * row (a word split by chords, or a stretch of spaces). Each cell is a
 * chord (or none) over the text it starts. When a cell's chord is wider
 * than its text, the renderer widens the cell so the next chord stays over
 * its own character - and draws a hyphen in the gap when `midWord` says
 * the word carries on in the next cell.
 */

export interface ChartCell {
  /** The chord(s) over this cell's first character; several on one character are joined by spaces. */
  chord: string | null;
  /** The same chords one by one, with the IDs they were given (to tell them apart: tapping one, say). */
  chords: { label: string; id?: string }[];
  text: string;
  /** The word continues in the next cell (so a gap here is drawn with a hyphen). */
  midWord: boolean;
}

export type ChartWord = ChartCell[];

export function layoutChordLine(text: string, chords: { at: number; label: string; id?: string }[]): ChartWord[] {
  // A line of chords only: each chord on its own, so a long run can wrap.
  if (text.length === 0) {
    return chords.map((chord) => [{ chord: chord.label, chords: [{ label: chord.label, id: chord.id }], text: "", midWord: false }]);
  }

  const byPosition = new Map<number, { label: string; id?: string }[]>();
  for (const chord of chords) {
    const at = Math.min(chord.at, text.length);
    byPosition.set(at, [...(byPosition.get(at) ?? []), { label: chord.label, id: chord.id }]);
  }
  const joined = (at: number) => byPosition.get(at)?.map((chord) => chord.label).join(" ") ?? null;

  const words: ChartWord[] = [];
  let offset = 0;
  for (const token of text.match(/\s+|\S+/g) ?? []) {
    const end = offset + token.length;
    const isWord = /\S/.test(token);
    const starts = [offset, ...[...byPosition.keys()].filter((at) => at > offset && at < end).sort((a, b) => a - b)];
    words.push(
      starts.map((start, k) => ({
        chord: joined(start),
        chords: byPosition.get(start) ?? [],
        text: text.slice(start, starts[k + 1] ?? end),
        midWord: isWord && k < starts.length - 1,
      })),
    );
    offset = end;
  }
  // A chord after the last character.
  const trailing = byPosition.get(text.length);
  if (trailing) words.push([{ chord: joined(text.length), chords: trailing, text: "", midWord: false }]);
  return words;
}
