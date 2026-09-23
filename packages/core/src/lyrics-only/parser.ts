import type { Section } from "../schemas/song-document.js";
import type { SectionType } from "../constants/index.js";
import { generateId, ID_PREFIXES } from "../ids/index.js";
import { LABEL_LINE, normalizeSectionType } from "../chordpro/section-labels.js";

/**
 * Parses plain lyrics (no chords) into SongDocument sections: a blank line
 * ends a section, and a section label line ("Verse 1", "[Chorus]",
 * "Bridge:") starts one, like the other two formats. Everything else is
 * lyric text taken as-is - square brackets included, since without chords
 * there's nothing for them to mean.
 */
export function parseLyricsOnly(text: string): Section[] {
  const sections: Section[] = [];
  let current: Section | null = null;
  let currentLines: Section["lines"] = [];

  const startSection = (type: SectionType, label: string | null) => {
    currentLines = [];
    current = { id: generateId(ID_PREFIXES.section), type, label, lines: currentLines };
    sections.push(current);
  };

  for (const rawLine of text.split(/\r\n|\r|\n/)) {
    const trimmed = rawLine.trim();
    if (trimmed === "") {
      current = null;
      continue;
    }
    const labelMatch = LABEL_LINE.exec(trimmed);
    if (labelMatch) {
      startSection(normalizeSectionType(labelMatch[1] ?? ""), trimmed);
      continue;
    }
    if (!current) startSection("other", null);
    currentLines.push({
      id: generateId(ID_PREFIXES.line),
      segments: [{ id: generateId(ID_PREFIXES.segment), lyric: rawLine.replace(/\s+$/, ""), chord: null }],
    });
  }

  return sections;
}
