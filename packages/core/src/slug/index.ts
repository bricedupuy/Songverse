// Characters that Unicode normalization can't fold on its own - these are
// distinct letters/ligatures, not a base letter plus a combining mark, so
// NFKD leaves them untouched. Matched after lowercasing.
const LIGATURE_MAP: Record<string, string> = {
  œ: "oe",
  æ: "ae",
  ß: "ss",
  ø: "o",
  ł: "l",
  đ: "d",
};
const LIGATURE_PATTERN = new RegExp(Object.keys(LIGATURE_MAP).join("|"), "g");

/**
 * Turns free text into a URL-safe, lowercase, hyphen-separated slug.
 *
 * - Diacritics are folded to their base letter (é -> e, ô -> o, ç -> c),
 *   including compatibility ligatures like the ﬁ/ﬂ typographic ligatures
 *   (via NFKD, which also flattens full-width and superscript variants).
 * - A handful of letters NFKD can't decompose (œ, æ, ß, ø, ł, đ) are mapped
 *   to their conventional plain-ASCII spelling.
 * - Apostrophes are dropped rather than turned into a hyphen, so "l'île"
 *   becomes "lile", not "l-ile".
 * - Everything else non-alphanumeric becomes a single hyphen separator.
 *
 * Use this everywhere a slug is derived from user- or content-authored
 * text (team names, tag labels, etc.) instead of writing a one-off
 * lowercase/replace chain - it's easy to miss one of the cases above.
 */
export function slugify(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(LIGATURE_PATTERN, (ch) => LIGATURE_MAP[ch] ?? ch)
    .trim()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
