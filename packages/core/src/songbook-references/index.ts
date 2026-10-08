/**
 * Songbook references in a search (issue #48): "HY 42", "HY42", "Hymns 42",
 * "42", "A-17", "Hymns FR-092" - the number people call out on stage. The
 * API and offline search read a query the same way.
 */
import { compareEntryCodes, normalizeEntryCode } from "../songbook-catalog-format/index.js";
import { foldForSearch } from "../search-text/index.js";
export interface SongbookReference {
  /** A songbook's abbreviation or part of its name; null for any songbook. */
  book: string | null;
  /** The entry's code, as printed ("42", "A-17"). */
  code: string;
}

const HAS_DIGIT = /\d/;
const LETTERS_THEN_CODE = /^([A-Za-zÀ-ÿ]+)(\d[\w-]*)$/;

/** The ways `query` can be read as a songbook entry, most likely first; none when it has no number. */
export function songbookReferences(query: string): SongbookReference[] {
  const q = query.trim().replace(/\s+/g, " ");
  if (!q || q.length > 60) return [];
  const space = q.lastIndexOf(" ");
  const last = space === -1 ? q : q.slice(space + 1);
  const book = space === -1 ? null : q.slice(0, space).replace(/[#,:]+$/, "").trim() || null;
  if (!HAS_DIGIT.test(last)) return [];
  const code = last.replace(/^#/, "");
  const references: SongbookReference[] = [{ book, code }];
  // "HY42": the abbreviation run together with the number.
  const joined = !book ? LETTERS_THEN_CODE.exec(code) : null;
  if (joined) references.unshift({ book: joined[1]!, code: joined[2]! });
  return references;
}


/**
 * Whether a songbook answers to `book`: its abbreviation exactly, or its name
 * containing it - two characters at least, or a single letter would match
 * nearly every songbook (case and accents ignored).
 */
export function songbookMatches(songbook: { name: string; abbreviation: string | null }, book: string | null): boolean {
  if (!book) return true;
  const wanted = foldForSearch(book);
  if (songbook.abbreviation !== null && foldForSearch(songbook.abbreviation) === wanted) return true;
  return wanted.length >= 2 && foldForSearch(songbook.name).includes(wanted);
}

/** Whether an entry's code is the one asked for (case and a plain number's leading zeros ignored: "42" is "042"). */
export function entryCodeMatches(entryCode: string | null, code: string): boolean {
  return entryCode !== null && normalizeEntryCode(entryCode).toLowerCase() === normalizeEntryCode(code).toLowerCase();
}

/**
 * A song's place in a songbook, the way to tell someone without the app
 * (issue #55): the songbook's abbreviation (or its name) and the number,
 * and the printed volume when the songbook has sections - "JEM 855 · JEM3".
 * An unnumbered songbook is just its name.
 */
export function formatSongbookReference(entry: {
  songbookName: string;
  abbreviation: string | null;
  entryCode: string | null;
  sectionLabel?: string | null;
}): string {
  if (!entry.entryCode) return entry.songbookName;
  const reference = `${entry.abbreviation?.trim() || entry.songbookName} ${entry.entryCode}`;
  return entry.sectionLabel ? `${reference} · ${entry.sectionLabel}` : reference;
}

/** How an entry's number answers a search (issue #213): that number, one starting with it, or one containing it. */
export type SongbookHitMatch = "exact" | "prefix" | "contains";

/** The shortest number that also finds the ones starting with it or containing it: "5" alone would find half of every songbook. */
export const PARTIAL_NUMBER_MIN_DIGITS = 2;

/** An entry's number as digits only, without leading zeros ("A-017" is "17"); null when it has none. */
function entryDigits(code: string): string | null {
  const digits = code.replace(/\D/g, "").replace(/^0+(?=\d)/, "");
  return digits || null;
}

/**
 * The digits of a search's number that `rankSongbookHits` also looks for
 * inside other numbers; null when there aren't enough of them. The API
 * fetches its candidates with them, offline search reads every entry.
 */
export function partialEntryDigits(query: string): string[] {
  return [...new Set(songbookReferences(query).filter((_, index) => index === 0).map((reference) => entryDigits(reference.code)))].filter(
    (digits): digits is string => digits !== null && digits.length >= PARTIAL_NUMBER_MIN_DIGITS,
  );
}

/**
 * Songbook entries for a search by number (issue #213), in the order to show
 * them: exactly that number first ("58": JEM 58, HY 58), then the numbers
 * starting with it (580, 581... 5800) and then the ones containing it (158,
 * 258... 1580), each group in number order, then by songbook. A number
 * with letters ("12a", "A-17") matches on its digits. "JEM 58" keeps all
 * three to that songbook; a number under two digits finds only itself.
 */
export function rankSongbookHits<T extends { entryCode: string | null; songbook: { name: string; abbreviation: string | null } }>(
  query: string,
  entries: T[],
): (T & { match: SongbookHitMatch })[] {
  const references = songbookReferences(query);
  const order: Record<SongbookHitMatch, number> = { exact: 0, prefix: 1, contains: 2 };
  const ranked: { entry: T; match: SongbookHitMatch; reference: number; value: number }[] = [];
  for (const entry of entries) {
    if (entry.entryCode === null) continue;
    const digits = entryDigits(entry.entryCode);
    let best: { match: SongbookHitMatch; reference: number } | null = null;
    references.forEach((reference, index) => {
      if (!songbookMatches(entry.songbook, reference.book)) return;
      const wanted = entryDigits(reference.code);
      let match: SongbookHitMatch | null = null;
      if (entryCodeMatches(entry.entryCode, reference.code)) match = "exact";
      // "HY42" read as written as well as "HY 42": only the latter finds numbers by their digits.
      else if (index === 0 && wanted && digits && wanted.length >= PARTIAL_NUMBER_MIN_DIGITS) {
        if (digits.startsWith(wanted)) match = "prefix";
        else if (digits.includes(wanted)) match = "contains";
      }
      if (match && (!best || order[match] < order[best.match] || (order[match] === order[best.match] && index < best.reference))) best = { match, reference: index };
    });
    if (best) ranked.push({ entry, ...(best as { match: SongbookHitMatch; reference: number }), value: digits ? Number(digits) : 0 });
  }
  return ranked
    .sort(
      (a, b) =>
        order[a.match] - order[b.match] ||
        (a.match === "exact" ? a.reference - b.reference : a.value - b.value) ||
        a.entry.songbook.name.localeCompare(b.entry.songbook.name) ||
        compareEntryCodes(a.entry.entryCode!, b.entry.entryCode!),
    )
    .map(({ entry, match }) => ({ ...entry, match }));
}

/** How many of each group a search shows at first (issue #213); Show more asks for more. */
export const SONGBOOK_HIT_LIMITS: Record<SongbookHitMatch, number> = { exact: 10, prefix: 20, contains: 20 };

/** Ranked hits cut to `limits` per group, in the same order. */
export function limitSongbookHits<T extends { match: SongbookHitMatch }>(hits: T[], limits: Record<SongbookHitMatch, number> = SONGBOOK_HIT_LIMITS): T[] {
  const taken: Record<SongbookHitMatch, number> = { exact: 0, prefix: 0, contains: 0 };
  return hits.filter((hit) => taken[hit.match]++ < limits[hit.match]);
}
