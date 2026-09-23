import { transposeKey, type SetlistSummary } from "@songverse/core";
import type { TFunction } from "i18next";

/** Dates are calendar days (YYYY-MM-DD), so they're formatted in UTC to avoid shifting by a day. */
export function formatSetDate(date: string, locale: string, style: "long" | "short" = "short"): string {
  const options: Intl.DateTimeFormatOptions =
    style === "long"
      ? { weekday: "long", year: "numeric", month: "long", day: "numeric", timeZone: "UTC" }
      : { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" };
  return new Date(`${date}T00:00:00Z`).toLocaleDateString(locale, options);
}

/** A set's custom name, else its date written out, else "Untitled set". */
export function setlistTitle(set: Pick<SetlistSummary, "name" | "eventDate">, t: TFunction, locale: string): string {
  if (set.name) return set.name;
  if (set.eventDate) return formatSetDate(set.eventDate, locale, "long");
  return t("sets.untitled");
}

function signed(steps: number): string {
  return steps > 0 ? `+${steps}` : `−${Math.abs(steps)}`;
}

/** e.g. "A (+2)" or "G (original)"; "+2 semitones" when the song has no recognizable key. */
export function transposeLabel(key: string | null, steps: number, t: TFunction): string {
  const target = key ? transposeKey(key, steps) : null;
  if (target) return steps === 0 ? `${target} (${t("sets.original")})` : `${target} (${signed(steps)})`;
  return steps === 0 ? t("sets.originalKey") : t("sets.semitones", { shift: signed(steps) });
}

export function todayIso(): string {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}
