/**
 * Text as search compares it (issue #59): lower case, without accents, and
 * with the ligatures spelled out - "Cœur" is "coeur", "Ægir" "aegir",
 * "Straße" "strasse" - as the database's unaccent() folds songs and
 * credits (#56). Everything matched in the browser, offline or in the API
 * outside the database uses this, so all searches agree.
 */
const LIGATURES: Record<string, string> = { œ: "oe", Œ: "oe", æ: "ae", Æ: "ae", ß: "ss", ẞ: "ss", ĳ: "ij", Ĳ: "ij", ﬁ: "fi", ﬂ: "fl" };

export function foldForSearch(text: string): string {
  return text
    .replace(/[œŒæÆßẞĳĲﬁﬂ]/g, (letter) => LIGATURES[letter] ?? letter)
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}
