import { DEFAULT_LOCALE, SUPPORTED_LOCALES, type LocaleValue } from "../constants/index.js";

/**
 * The supported locale a browser's Accept-Language header prefers most
 * ("fr-CA,fr;q=0.9,en;q=0.8" -> "fr"), or the default when it names none.
 */
export function localeFromAcceptLanguage(header: string | null | undefined): LocaleValue {
  const ranked = (header ?? "")
    .split(",")
    .map((part, index) => {
      const [tag = "", ...params] = part.trim().split(";");
      const q = params.map((p) => /^\s*q=([\d.]+)\s*$/.exec(p)?.[1]).find(Boolean);
      return { language: tag.trim().toLowerCase().split("-")[0], q: q === undefined ? 1 : Number(q), index };
    })
    .filter(({ language, q }) => language && q > 0)
    .sort((a, b) => b.q - a.q || a.index - b.index);
  const match = ranked.find(({ language }) => (SUPPORTED_LOCALES as readonly string[]).includes(language!));
  return (match?.language as LocaleValue | undefined) ?? DEFAULT_LOCALE;
}
