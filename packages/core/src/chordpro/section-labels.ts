import type { SectionType } from "../constants/index.js";

// Section names as songs from other tools write them, in the languages
// songs come in, each with the section type it means.
const SECTION_NAMES: [SectionType, string][] = [
  ["pre-chorus", "pre[- ]?chorus|pr[ée][- ]?refrain|pre[- ]?coro|pr[ée][- ]?refr[ãa]o|pre[- ]?ritornello"],
  ["post-chorus", "post[- ]?chorus|post[- ]?refrain|post[- ]?coro"],
  ["chorus", "chorus|refrain|coro|estribillo|refr[ãa]o|ritornello"],
  ["verse", "verse|strophe|couplet|estrofa|verso|strofa|vers"],
  ["bridge", "bridge|pont|puente|ponte|br[üu]cke"],
  ["intro", "intro|introduction|introducci[óo]n|introdu[çc][ãa]o|introduzione|vorspiel"],
  ["outro", "outro|ending|fin|final|finale|coda|nachspiel"],
  ["instrumental", "instrumental|solo"],
  ["interlude", "interlude|interludio|zwischenspiel"],
  ["vamp", "vamp"],
  ["breakdown", "breakdown"],
  ["tag", "tag"],
  ["other", "other"],
];
const NAMES = SECTION_NAMES.map(([, names]) => names).join("|");

// A line containing only a section name, optionally numbered or lettered,
// bracketed, or followed by a colon ("Verse 1", "[Chorus]", "Bridge:",
// "Strophe 2a", "Fin b") is a label for the block that follows. Shared
// between the ChordPro and chords-over-lyrics parsers, which both accept
// this as the common convention for text pasted from other tools rather
// than authored with explicit directives; a ChordPro comment holding one
// names the section after it.
export const LABEL_LINE = new RegExp(`^\\[?\\s*(${NAMES})(?:\\s*\\.?\\s*(\\d+[a-d]?)|\\s*\\.?\\s*([a-d]))?\\s*:?\\s*\\]?$`, "iu");

export function normalizeSectionType(label: string): SectionType {
  const name = label.trim();
  return SECTION_NAMES.find(([, names]) => new RegExp(`^(?:${names})$`, "iu").test(name))?.[0] ?? "other";
}

/** A section heading ("Strophe 2", "Refrain", "[Bridge]"): its type and its number or letter, if it has one; null if the text isn't one. */
export function sectionHeading(text: string): { type: SectionType; number: string | null } | null {
  const match = LABEL_LINE.exec(text.trim());
  if (!match) return null;
  return { type: normalizeSectionType(match[1]!), number: match[2] ?? match[3] ?? null };
}
