import type { LocaleValue } from "../constants/index.js";

/**
 * Resolves a translatable DB label (Tag.label/TagCategory.label plus their
 * optional `translations` JSON column) for a given locale, falling back to
 * the English `label` when no override exists for that locale.
 */
export function resolveTranslation(
  label: string,
  translations: unknown,
  locale: LocaleValue,
): string {
  if (locale === "en" || !translations || typeof translations !== "object") return label;
  const value = (translations as Record<string, unknown>)[locale];
  return typeof value === "string" && value.trim() !== "" ? value : label;
}
