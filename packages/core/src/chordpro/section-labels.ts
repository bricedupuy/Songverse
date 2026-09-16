import { SECTION_TYPES, type SectionType } from "../constants/index.js";

// A line containing only a recognized section name (optionally numbered,
// bracketed, or followed by a colon - "Verse 1", "[Chorus]", "Bridge:")
// is treated as a label for the block that follows. Shared between the
// ChordPro and chords-over-lyrics parsers, which both accept this as the
// common convention for text pasted from other tools rather than authored
// with explicit directives.
export const LABEL_LINE = new RegExp(`^\\[?\\s*(${SECTION_TYPES.join("|")})\\s*\\d*\\s*:?\\s*\\]?$`, "i");

export function normalizeSectionType(label: string): SectionType {
  const key = label.toLowerCase().replace(/\s+/g, "-") as SectionType;
  return SECTION_TYPES.includes(key) ? key : "other";
}
