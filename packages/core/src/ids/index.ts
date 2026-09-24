import { customAlphabet } from "nanoid";

// Unambiguous alphabet (no 0/O/1/I/l) for IDs that may be read aloud or transcribed.
const alphabet = "0123456789abcdefghijklmnopqrstuvwxyz";
const nano = customAlphabet(alphabet, 16);

/**
 * Generates a stable, prefixed ID for a SongDocument/ArrangementDocument node.
 *
 * These IDs are generated once at creation and must never be regenerated on
 * save — they are referenced by arrangement overrides, notes, ink
 * annotations, rhythm maps, and diffs. See song-document-v1.md and
 * arrangement-document-v1.md "ID Stability Rules".
 */
export function generateId(prefix: IdPrefix): string {
  return `${prefix}${nano()}`;
}

export const ID_PREFIXES = {
  section: "sec_",
  line: "line_",
  segment: "seg_",
  chord: "chd_",
  flowItem: "fi_",
  arrangementItem: "ai_",
  insertedLine: "ins_line_",
  insertedSegment: "ins_seg_",
  insertedChord: "ins_chd_",
} as const;

export type IdPrefix = (typeof ID_PREFIXES)[keyof typeof ID_PREFIXES];
