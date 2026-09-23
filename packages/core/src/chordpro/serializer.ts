import type { SongDocument } from "../schemas/song-document.js";
import type { SectionType } from "../constants/index.js";

// Inverse of SECTION_DIRECTIVES in parser.ts - only the types ChordPro has
// a real directive for. Everything else falls back to a plain label line.
const SECTION_DIRECTIVES: Partial<Record<SectionType, [start: string, end: string]>> = {
  verse: ["start_of_verse", "end_of_verse"],
  chorus: ["start_of_chorus", "end_of_chorus"],
  bridge: ["start_of_bridge", "end_of_bridge"],
  instrumental: ["start_of_tab", "end_of_tab"],
};

function titleCase(type: string): string {
  return type
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join("-");
}

/**
 * Serializes a SongDocument to ChordPro text - the export half of the
 * import/export pair (see parser.ts for import). documentJson.sections is
 * always the canonical, stored representation; this is only ever computed
 * on demand for the user to copy/download, or to refresh the
 * `chordproCache` convenience column (see the schema's own comment on
 * that column: "regenerated on save").
 */
export function serializeChordPro(doc: SongDocument): string {
  const lines: string[] = [];

  if (doc.metadata.title) lines.push(`{title: ${doc.metadata.title}}`);
  if (doc.metadata.ccli) lines.push(`{ccli: ${doc.metadata.ccli}}`);
  if (doc.defaults.key) lines.push(`{key: ${doc.defaults.key}}`);
  if (doc.defaults.tempo) lines.push(`{tempo: ${doc.defaults.tempo}}`);
  if (doc.defaults.timeSignature) lines.push(`{time: ${doc.defaults.timeSignature.numerator}/${doc.defaults.timeSignature.denominator}}`);
  if (doc.defaults.capo) lines.push(`{capo: ${doc.defaults.capo}}`);
  if (lines.length > 0) lines.push("");

  const header = lines.length > 0 ? lines.join("\n") + "\n" : "";
  return (header + serializeChordProSections(doc.sections)).trimEnd() + "\n";
}

/**
 * Just the chart, without the song's details up top - what the song
 * editor shows as the text to edit, since those details have fields of
 * their own (and the parser skips those directives on the way back in).
 */
export function serializeChordProSections(sections: SongDocument["sections"]): string {
  const lines: string[] = [];

  for (const section of sections) {
    const directive = SECTION_DIRECTIVES[section.type];
    if (directive) {
      lines.push(section.label ? `{${directive[0]}: ${section.label}}` : `{${directive[0]}}`);
    } else {
      const label = section.label ?? (section.type !== "other" ? titleCase(section.type) : null);
      if (label) lines.push(label);
    }

    for (const line of section.lines) {
      lines.push(line.segments.map((segment) => (segment.chord ? `[${segment.chord.raw}]${segment.lyric}` : segment.lyric)).join(""));
    }

    if (directive) lines.push(`{${directive[1]}}`);
    lines.push("");
  }

  const text = lines.join("\n").trimEnd();
  return text ? text + "\n" : "";
}
