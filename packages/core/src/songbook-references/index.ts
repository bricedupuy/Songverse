/**
 * Songbook references in a search (issue #48): "HY 42", "HY42", "Hymns 42",
 * "42", "A-17", "Hymns FR-092" - the number people call out on stage. The
 * API and offline search read a query the same way.
 */
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

function fold(text: string): string {
  return text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

/**
 * Whether a songbook answers to `book`: its abbreviation exactly, or its name
 * containing it - two characters at least, or a single letter would match
 * nearly every songbook (case and accents ignored).
 */
export function songbookMatches(songbook: { name: string; abbreviation: string | null }, book: string | null): boolean {
  if (!book) return true;
  const wanted = fold(book);
  if (songbook.abbreviation !== null && fold(songbook.abbreviation) === wanted) return true;
  return wanted.length >= 2 && fold(songbook.name).includes(wanted);
}

/** Whether an entry's code is the one asked for (case ignored). */
export function entryCodeMatches(entryCode: string | null, code: string): boolean {
  return entryCode !== null && entryCode.toLowerCase() === code.toLowerCase();
}
