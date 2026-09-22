/**
 * A number range within a NUMBERED songbook, mapped to a display label
 * (e.g. a hymnal's volume: {label: "JEM1", start: 1, end: 371}). Stored as
 * an ordered list on Songbook.sections (JSON) - see
 * docs/songbooks-and-catalog.md §4 for why this is computed on read rather
 * than persisted per-entry.
 */
export interface SongbookSection {
  label: string;
  start: number;
  end: number;
}

/**
 * Finds which section an entry's numeric code falls into, or null if the
 * code doesn't parse as a plain integer or matches no defined range.
 * Ranges are checked in order; the first match wins if they overlap.
 */
export function computeSectionLabel(entryCode: string | null, sections: SongbookSection[] | null): string | null {
  if (!entryCode || !sections || sections.length === 0) return null;
  // Only a plain integer (optionally zero-padded, e.g. "0245") matches a
  // range - codes like "A-17" simply have no section.
  if (!/^\d+$/.test(entryCode)) return null;

  const numericCode = Number.parseInt(entryCode, 10);
  const match = sections.find((section) => numericCode >= section.start && numericCode <= section.end);
  return match?.label ?? null;
}

/**
 * Validates a candidate sections list (e.g. from a request body), throwing
 * a plain Error with a human-readable message on the first problem found.
 * Ranges may not overlap - callers should surface the Error message as a
 * 400 Bad Request.
 */
export function validateSongbookSections(value: unknown): SongbookSection[] {
  if (!Array.isArray(value)) throw new Error("sections must be an array");

  const sections: SongbookSection[] = value.map((raw, index) => {
    if (typeof raw !== "object" || raw === null) throw new Error(`sections[${index}] must be an object`);
    const { label, start, end } = raw as Record<string, unknown>;
    if (typeof label !== "string" || label.trim().length === 0) {
      throw new Error(`sections[${index}].label must be a non-empty string`);
    }
    if (typeof start !== "number" || !Number.isInteger(start)) {
      throw new Error(`sections[${index}].start must be an integer`);
    }
    if (typeof end !== "number" || !Number.isInteger(end)) {
      throw new Error(`sections[${index}].end must be an integer`);
    }
    if (start > end) throw new Error(`sections[${index}]: start must not be greater than end`);
    return { label: label.trim(), start, end };
  });

  for (let i = 0; i < sections.length; i++) {
    for (let j = i + 1; j < sections.length; j++) {
      const a = sections[i]!;
      const b = sections[j]!;
      if (a.start <= b.end && b.start <= a.end) {
        throw new Error(`sections "${a.label}" and "${b.label}" overlap`);
      }
    }
  }

  return sections;
}
