import { z } from "zod";

/**
 * Building blocks for the API's request schemas (issue #118): one
 * definition of each request, used by the API to validate it and by
 * clients for its type. Every request object is strict - a field the API
 * doesn't know is refused, not ignored.
 */

/** Left out, or null: the same as left out (undefined after parsing). */
export const optional = <T extends z.ZodType>(schema: T) =>
  schema
    .nullable()
    .transform((value) => value ?? undefined)
    .optional();

/** Trimmed text; "" or null clears it (null), left out leaves it alone. */
export const clearableText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => value || null)
    .nullable()
    .optional();

/** Text that must be there: trimmed, then at least one character. */
export const requiredText = (max: number) => z.string().trim().min(1).max(max);

/** A whole number from min to max; null clears it, left out leaves it alone. */
export const clearableInt = (min: number, max: number) => z.number().int().min(min).max(max).nullable().optional();

/** Names (artists, composers…): each trimmed, blanks dropped, then counted. */
export const nameList = (options: { min?: number; max: number; each: number; minMessage?: string }) =>
  z
    .array(z.string().trim())
    .transform((names) => names.filter((name) => name !== ""))
    .pipe(
      z
        .array(z.string().max(options.each))
        .min(options.min ?? 0, options.minMessage)
        .max(options.max),
    );

/** A number in a query string ("2"), or already one. */
export const queryInt = () =>
  z
    .union([z.number(), z.string().trim().min(1)])
    .transform((value) => Number(value))
    .pipe(z.number().int());

/** "true" in a query string (or true) is true; anything else false. */
export const queryBoolean = () => z.union([z.boolean(), z.string()]).transform((value) => value === true || value === "true");

/** Trimmed text in a query string. */
export const queryText = (max: number) => z.string().trim().max(max);

/**
 * A web address, as class-validator's IsUrl took it: with or without
 * "https://" ("example.com/page"), a host with a dot in it.
 */
export const webAddress = () =>
  z.string().refine((value) => {
    const withScheme = /^[a-z][a-z\d+.-]*:\/\//i.test(value) ? value : `https://${value}`;
    if (!URL.canParse(withScheme)) return false;
    const url = new URL(withScheme);
    return /^(https?|ftp):$/.test(url.protocol) && url.hostname.includes(".") && !/\s/.test(value);
  }, { params: { format: "url" } });
