import type { Section } from "../schemas/song-document.js";
import type { Line, Segment } from "../schemas/shared.js";
import { SECTION_TYPES, type SectionType } from "../constants/index.js";
import { generateId, ID_PREFIXES } from "../ids/index.js";

// Chord normalization (root/quality/extensions via @tonaljs/tonal) is
// deliberately deferred - NormalizedChordSchema is nullable specifically so
// a chord can exist and render correctly before that lands. This parser
// only ever produces `normalized: null`; see the follow-up task for
// wiring Tonal in without blocking the paste-and-view flow that actually
// matters to a user first.

// ChordPro's standard short/long section directives - see
// https://www.chordpro.org/chordpro/directives-env/
const SECTION_DIRECTIVES: Record<string, SectionType> = {
  sov: "verse",
  start_of_verse: "verse",
  soc: "chorus",
  start_of_chorus: "chorus",
  sob: "bridge",
  start_of_bridge: "bridge",
  sot: "instrumental",
  start_of_tab: "instrumental",
};
const END_DIRECTIVES = new Set(["eov", "end_of_verse", "eoc", "end_of_chorus", "eob", "end_of_bridge", "eot", "end_of_tab"]);

// A line containing only a recognized section name (optionally numbered,
// bracketed, or followed by a colon - "Verse 1", "[Chorus]", "Bridge:")
// is treated as a label for the block that follows, the common convention
// in ChordPro-ish text pasted from other tools rather than authored with
// explicit {start_of_x}/{end_of_x} directives.
const LABEL_LINE = new RegExp(`^\\[?\\s*(${SECTION_TYPES.join("|")})\\s*\\d*\\s*:?\\s*\\]?$`, "i");

function normalizeSectionType(label: string): SectionType {
  const key = label.toLowerCase().replace(/\s+/g, "-") as SectionType;
  return SECTION_TYPES.includes(key) ? key : "other";
}

/** Splits one lyric line into segments at each `[Chord]` marker. Text
 * before the first chord (if any) becomes a chord-less leading segment. */
function parseLine(raw: string): Line {
  const segments: Segment[] = [];
  const re = /\[([^\]]+)\]/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let pendingChord: string | null = null;

  const pushSegment = (lyric: string, chordRaw: string | null) => {
    if (lyric === "" && chordRaw === null) return;
    segments.push({
      id: generateId(ID_PREFIXES.segment),
      lyric,
      chord: chordRaw ? { id: generateId(ID_PREFIXES.chord), raw: chordRaw, normalized: null } : null,
    });
  };

  while ((match = re.exec(raw)) !== null) {
    const textBefore = raw.slice(lastIndex, match.index);
    pushSegment(textBefore, pendingChord);
    pendingChord = match[1] ?? null;
    lastIndex = re.lastIndex;
  }
  pushSegment(raw.slice(lastIndex), pendingChord);

  // A line with no chords and no lyric text at all (pure whitespace)
  // still needs one segment so the line renders as a blank spacer.
  if (segments.length === 0) segments.push({ id: generateId(ID_PREFIXES.segment), lyric: "", chord: null });

  return { id: generateId(ID_PREFIXES.line), segments };
}

/**
 * Parses ChordPro-ish text into SongDocument sections. Supports the
 * standard {start_of_x}/{end_of_x} directives, plain-text section labels
 * ("Verse 1", "[Chorus]"), and falls back to one blank-line-separated
 * section per block when neither is present. Any other `{directive}`
 * line (title, key, tempo, comments, etc.) is silently skipped - those
 * map to the song's own metadata/defaults fields, entered separately.
 */
export function parseChordPro(text: string): Section[] {
  const sections: Section[] = [];
  let current: Section | null = null;
  let explicitBlock = false;

  let currentLines: Section["lines"] = [];
  const startSection = (type: SectionType, label: string | null) => {
    currentLines = [];
    current = { id: generateId(ID_PREFIXES.section), type, label, lines: currentLines };
    sections.push(current);
  };
  const ensureSection = () => {
    if (!current) startSection("other", null);
  };

  for (const rawLine of text.split(/\r\n|\r|\n/)) {
    const line = rawLine.trim();

    const directiveMatch = /^\{([^:}]+)(?::\s*(.*))?\}$/.exec(line);
    if (directiveMatch) {
      const key = (directiveMatch[1] ?? "").trim().toLowerCase().replace(/\s+/g, "_");
      const sectionType = SECTION_DIRECTIVES[key];
      if (sectionType) {
        startSection(sectionType, directiveMatch[2]?.trim() || null);
        explicitBlock = true;
      } else if (END_DIRECTIVES.has(key)) {
        current = null;
        explicitBlock = false;
      }
      // other directives (title, key, tempo, comment, ...) are ignored here
      continue;
    }

    if (line === "") {
      // A blank line ends an implicit (label-detected) section, but not
      // an explicit {start_of_x}...{end_of_x} block, which only {end_of_x}
      // can close.
      if (!explicitBlock) current = null;
      continue;
    }

    const labelMatch = LABEL_LINE.exec(line);
    if (labelMatch && !explicitBlock) {
      startSection(normalizeSectionType(labelMatch[1] ?? ""), line);
      continue;
    }

    ensureSection();
    currentLines.push(parseLine(rawLine));
  }

  return sections;
}
