import type { SectionType } from "../constants/index.js";
import type { Line, Segment } from "./shared.js";
import type { LineV2, SongDocumentV2 } from "./song-document-v2.js";

/**
 * A section as the import parsers (ChordPro, chords over lyrics, plain
 * lyrics) read it: each line cut into segments at its chords. Turned into
 * SongDocument v2 by `parsedSectionsToV2`; never stored.
 */
export interface ParsedSection {
  id: string;
  type: SectionType;
  label?: string | null;
  lines: Line[];
}

/** A line's segments as one text, chords pinned where each segment began. */
function joinSegments(id: string, segments: Segment[]): LineV2 {
  let text = "";
  const chords: LineV2["chords"] = [];
  for (const segment of segments) {
    if (segment.chord) chords.push({ id: segment.chord.id, at: text.length, raw: segment.chord.raw });
    text += segment.lyric;
  }
  return { id, kind: "lyric", text, chords };
}

/** Parsed sections as v2 sections, without timing. */
export function parsedSectionsToV2(sections: ParsedSection[]): SongDocumentV2["sections"] {
  return sections.map((section) => ({
    id: section.id,
    type: section.type,
    label: section.label ?? null,
    showLabel: true,
    lines: section.lines.map((line) => joinSegments(line.id, line.segments)),
    rhythm: null,
    groove: null,
  }));
}
