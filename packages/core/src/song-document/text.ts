import type { SectionType, SupportedImportFormat } from "../constants/index.js";
import { parseSongText } from "../import-detection/detect-format.js";
import { parseSongDocument } from "../schemas/song-document.js";
import { sectionsV1ToV2, songDocumentV1ToV2 } from "../schemas/song-document-v1-to-v2.js";
import {
  parseSongDocumentV2,
  type SectionV2,
  type SongDefaultsV2,
  type SongDocumentV2,
} from "../schemas/song-document-v2.js";
import { reconcileFlow, reconcileSections } from "./reconcile.js";

/** Pasted or typed text (ChordPro, chords over lyrics, plain lyrics) as v2 sections, with fresh IDs. */
export function sectionsFromText(text: string, format: SupportedImportFormat): SectionV2[] {
  return text.trim() ? sectionsV1ToV2(parseSongText(text, format)) : [];
}

/**
 * The song after its content was edited as text: the text parsed, IDs
 * kept from `previous` wherever the content is still there, and the
 * revision moved on. `content` undefined keeps the previous sections.
 */
export function songDocumentFromText(
  previous: SongDocumentV2 | null,
  change: { content?: string; format: SupportedImportFormat; defaults?: SongDefaultsV2 },
): SongDocumentV2 {
  const sections =
    change.content === undefined
      ? (previous?.sections ?? [])
      : reconcileSections(previous?.sections ?? [], sectionsFromText(change.content, change.format));
  return parseSongDocumentV2({
    $schema: "song-document/v2",
    revision: (previous?.revision ?? 0) + 1,
    defaults: { ...(previous?.defaults ?? {}), ...(change.defaults ?? {}) },
    sections,
    flow: reconcileFlow(previous, sections),
  });
}

/**
 * The song after its sections were edited in the structured editor, which
 * keeps IDs itself: sections taken as they are, the flow following them,
 * and the revision moved on.
 */
export function songDocumentFromSections(
  previous: SongDocumentV2 | null,
  change: { sections?: SectionV2[]; defaults?: SongDefaultsV2 },
): SongDocumentV2 {
  const sections = change.sections ?? previous?.sections ?? [];
  return parseSongDocumentV2({
    $schema: "song-document/v2",
    revision: (previous?.revision ?? 0) + 1,
    defaults: { ...(previous?.defaults ?? {}), ...(change.defaults ?? {}) },
    sections,
    flow: reconcileFlow(previous, sections),
  });
}

/**
 * Any stored song document as v2. Songs saved before v2 are converted on
 * the fly (and written back by the API's upgrade job); anything unreadable
 * throws.
 */
export function readSongDocument(json: unknown): SongDocumentV2 {
  const schema = (json as { $schema?: unknown } | null)?.$schema;
  if (schema === "song-document/v1") return songDocumentV1ToV2(parseSongDocument(json)).document;
  return parseSongDocumentV2(json);
}

// ChordPro's own section environments; other types get a plain label line.
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

/** A line with its chords inline: "[G]Amazing grace how [G7]sweet". */
export function lineToInlineText(line: SectionV2["lines"][number]): string {
  if (line.kind === "note") return `{comment: ${line.text}}`;
  let text = "";
  let cursor = 0;
  for (const chord of line.chords) {
    text += line.text.slice(cursor, chord.at) + `[${chord.raw}]`;
    cursor = chord.at;
  }
  return text + line.text.slice(cursor);
}

/**
 * The chart as ChordPro, without the song's details: what the song editor
 * shows as text, and the body of a ChordPro export. Each section once, in
 * stored order.
 */
export function sectionsToChordPro(sections: SectionV2[]): string {
  const lines: string[] = [];
  for (const section of sections) {
    const directive = SECTION_DIRECTIVES[section.type];
    if (directive) {
      lines.push(section.label ? `{${directive[0]}: ${section.label}}` : `{${directive[0]}}`);
    } else {
      const label = section.label ?? (section.type !== "other" ? titleCase(section.type) : null);
      if (label) lines.push(label);
    }
    for (const line of section.lines) lines.push(lineToInlineText(line));
    if (directive) lines.push(`{${directive[1]}}`);
    lines.push("");
  }
  const text = lines.join("\n").trimEnd();
  return text ? text + "\n" : "";
}

/** The song's details a ChordPro export carries (they live in SongVersion columns, not the document). */
export interface ChordProDetails {
  title: string;
  subtitle?: string | null;
  artists?: string[];
  composers?: string[];
  lyricists?: string[];
  album?: string | null;
  year?: number | null;
  copyright?: string | null;
  ccli?: string | null;
  capo?: number | null;
}

/** A ChordPro file for the song: its details as directives, then the chart. */
export function songToChordPro(doc: SongDocumentV2, details: ChordProDetails): string {
  const header: string[] = [];
  const directive = (name: string, value: string | number | null | undefined) => {
    if (value !== null && value !== undefined && String(value).trim()) header.push(`{${name}: ${String(value).trim()}}`);
  };
  directive("title", details.title);
  directive("subtitle", details.subtitle);
  for (const artist of details.artists ?? []) directive("artist", artist);
  for (const composer of details.composers ?? []) directive("composer", composer);
  for (const lyricist of details.lyricists ?? []) directive("lyricist", lyricist);
  directive("album", details.album);
  directive("year", details.year);
  directive("copyright", details.copyright);
  directive("ccli", details.ccli);
  directive("key", doc.defaults.key);
  directive("tempo", doc.defaults.tempo);
  if (doc.defaults.timeSignature) directive("time", `${doc.defaults.timeSignature.numerator}/${doc.defaults.timeSignature.denominator}`);
  if (details.capo) directive("capo", details.capo);
  const body = sectionsToChordPro(doc.sections);
  return [header.join("\n"), body].filter(Boolean).join("\n\n").trimEnd() + "\n";
}
