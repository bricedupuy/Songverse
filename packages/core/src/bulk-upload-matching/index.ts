/**
 * Filename -> songbook entry number matching for bulk content upload (see
 * docs/songbooks-and-catalog.md §7). Matching is number-first, not
 * fuzzy-first: title-similarity matching isn't reliable enough to run
 * unattended at volume (e.g. "Amazing Grace" vs. "Amazing Grace
 * (Reprise)"), so this only ever looks at the numeric token in the
 * filename ("0245.cho", "JEM_0245.pdf" -> "245").
 */

export type BulkUploadMatchStatus = "MATCHED" | "UNMATCHED" | "DUPLICATE";

export interface BulkUploadFileMatch {
  filename: string;
  entryCode: string | null;
  status: BulkUploadMatchStatus;
}

/** The first run of digits in the filename, ignoring the extension. */
export function extractNumericToken(filename: string): string | null {
  const base = filename.replace(/\.[^./\\]+$/, "");
  const match = base.match(/(\d+)/);
  return match?.[1] ?? null;
}

/**
 * Two codes match if they're identical, or - since filenames are usually
 * zero-padded to match a printed edition ("0245") while a hand-entered
 * entryCode might not be ("245") - if both are purely numeric and equal
 * as numbers.
 */
function codesMatch(extractedToken: string, entryCode: string): boolean {
  if (extractedToken === entryCode) return true;
  if (!/^\d+$/.test(entryCode)) return false;
  return Number(extractedToken) === Number(entryCode);
}

/**
 * Matches each filename against the given list of real entry codes.
 * A code claimed by more than one file is reported as DUPLICATE for every
 * file that claims it - callers must resolve the conflict by hand rather
 * than guessing, per the "review step is mandatory" rule in §7.
 */
export function matchFilenamesToEntryCodes(filenames: string[], entryCodes: string[]): BulkUploadFileMatch[] {
  const perFile = filenames.map((filename) => {
    const token = extractNumericToken(filename);
    const entryCode = token ? (entryCodes.find((code) => codesMatch(token, code)) ?? null) : null;
    return { filename, entryCode };
  });

  const claimCounts = new Map<string, number>();
  for (const { entryCode } of perFile) {
    if (entryCode) claimCounts.set(entryCode, (claimCounts.get(entryCode) ?? 0) + 1);
  }

  return perFile.map(({ filename, entryCode }) => ({
    filename,
    entryCode,
    status: !entryCode ? "UNMATCHED" : (claimCounts.get(entryCode) ?? 0) > 1 ? "DUPLICATE" : "MATCHED",
  }));
}
