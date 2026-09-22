/**
 * The full ISO 639-1 two-letter language code set (stable, doesn't
 * change). Display names are deliberately NOT hardcoded here - they're
 * derived at render time via Intl.DisplayNames, which is built into
 * every modern JS runtime, so names show in whatever locale the viewer
 * is using rather than being frozen to one language forever.
 */
export const ISO_639_1_CODES = [
  "aa", "ab", "ae", "af", "ak", "am", "an", "ar", "as", "av",
  "ay", "az", "ba", "be", "bg", "bh", "bi", "bm", "bn", "bo",
  "br", "bs", "ca", "ce", "ch", "co", "cr", "cs", "cu", "cv",
  "cy", "da", "de", "dv", "dz", "ee", "el", "en", "eo", "es",
  "et", "eu", "fa", "ff", "fi", "fj", "fo", "fr", "fy", "ga",
  "gd", "gl", "gn", "gu", "gv", "ha", "he", "hi", "ho", "hr",
  "ht", "hu", "hy", "hz", "ia", "id", "ie", "ig", "ii", "ik",
  "io", "is", "it", "iu", "ja", "jv", "ka", "kg", "ki", "kj",
  "kk", "kl", "km", "kn", "ko", "kr", "ks", "ku", "kv", "kw",
  "ky", "la", "lb", "lg", "li", "ln", "lo", "lt", "lu", "lv",
  "mg", "mh", "mi", "mk", "ml", "mn", "mr", "ms", "mt", "my",
  "na", "nb", "nd", "ne", "ng", "nl", "nn", "no", "nr", "nv",
  "ny", "oc", "oj", "om", "or", "os", "pa", "pi", "pl", "ps",
  "pt", "qu", "rm", "rn", "ro", "ru", "rw", "sa", "sc", "sd",
  "se", "sg", "si", "sk", "sl", "sm", "sn", "so", "sq", "sr",
  "ss", "st", "su", "sv", "sw", "ta", "te", "tg", "th", "ti",
  "tk", "tl", "tn", "to", "tr", "ts", "tt", "tw", "ty", "ug",
  "uk", "ur", "uz", "ve", "vi", "vo", "wa", "wo", "xh", "yi",
  "yo", "za", "zh", "zu",
] as const;

export type Iso6391Code = (typeof ISO_639_1_CODES)[number];

/**
 * Resolves a language code to its display name in `displayLocale`
 * (defaults to English). Falls back to the raw code for anything
 * Intl.DisplayNames doesn't recognize - e.g. legacy free-text values
 * saved before this constraint existed.
 */
export function getLanguageDisplayName(code: string, displayLocale = "en"): string {
  try {
    const names = new Intl.DisplayNames([displayLocale], { type: "language" });
    return names.of(code) ?? code;
  } catch {
    return code;
  }
}
