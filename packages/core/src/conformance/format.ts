/**
 * The shared test cases' format (issue #170): what's written to
 * packages/core/conformance/*.json, and how an implementation - this one,
 * the iOS and Android apps' - compares its answers with them. The rules
 * are in packages/core/conformance/README.md; keep the two together.
 */

export const CONFORMANCE_SCHEMA = "songverse-conformance/v1";

/** One case: a function's arguments, and what it must answer. */
export interface ConformanceCase {
  name: string;
  args: unknown[];
  /** The answer, as JSON; `{ "$throws": true }` when it must fail. */
  expected: unknown;
}

export interface ConformanceFile {
  $schema: typeof CONFORMANCE_SCHEMA;
  area: string;
  about: string;
  functions: Record<string, { about: string; params: string[]; cases: ConformanceCase[] }>;
}

export const THROWS = { $throws: true } as const;

/** An ID made by generateId(): a prefix ("sec_", "ins_line_"), then 16 letters and digits. */
const GENERATED_ID = /^((?:[a-z]+_)+)([0-9a-z]{16})$/;

/**
 * An answer as JSON: Maps as objects, Sets as arrays, undefined left out
 * of objects (null in arrays), -0 as 0.
 */
export function toJson(value: unknown): unknown {
  if (value === undefined) return undefined;
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error(`Not a JSON number: ${value}`);
    return Object.is(value, -0) ? 0 : value;
  }
  if (value instanceof Map) return toJson(Object.fromEntries(value));
  if (value instanceof Set) return toJson([...value]);
  if (Array.isArray(value)) return value.map((item) => toJson(item) ?? null);
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      const json = toJson(item);
      if (json !== undefined) out[key] = json;
    }
    return out;
  }
  throw new Error(`Not JSON: ${typeof value}`);
}

function strings(value: unknown, into: Set<string>) {
  if (typeof value === "string") into.add(value);
  else if (Array.isArray(value)) value.forEach((item) => strings(item, into));
  else if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      into.add(key);
      strings(item, into);
    }
  }
}

/**
 * IDs made while answering are random: each becomes its prefix and a
 * number, in the order they first appear ("sec_@1", and "fi_@1" for the
 * flow item made from that section's ID - same random part, same number).
 * IDs given in the arguments are kept as they are, so an answer shows
 * which it kept. Keys are normalized as values are.
 */
export function normalizeIds(answer: unknown, args: unknown): unknown {
  const given = new Set<string>();
  strings(args, given);
  const numbers = new Map<string, number>();
  const id = (text: string) => {
    if (given.has(text)) return text;
    const match = GENERATED_ID.exec(text);
    if (!match) return text;
    const random = match[2]!;
    if (!numbers.has(random)) numbers.set(random, numbers.size + 1);
    return `${match[1]}@${numbers.get(random)}`;
  };
  const walk = (value: unknown): unknown => {
    if (typeof value === "string") return id(value);
    if (Array.isArray(value)) return value.map(walk);
    if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [id(key), walk(item)]));
    return value;
  };
  return walk(answer);
}

/** Numbers within this of each other are the same answer (floating point differs a little between platforms). */
export const NUMBER_TOLERANCE = 1e-9;

/** Where `actual` differs from `expected` ("functions.passes[0].key"), or null when it's the same answer. */
export function differs(actual: unknown, expected: unknown, path = "$"): string | null {
  if (typeof actual === "number" && typeof expected === "number") {
    return Math.abs(actual - expected) <= NUMBER_TOLERANCE * Math.max(1, Math.abs(expected)) ? null : `${path}: ${actual}, expected ${expected}`;
  }
  if (Array.isArray(expected)) {
    if (!Array.isArray(actual)) return `${path}: not a list`;
    if (actual.length !== expected.length) return `${path}: ${actual.length} items, expected ${expected.length}`;
    for (let i = 0; i < expected.length; i++) {
      const found = differs(actual[i], expected[i], `${path}[${i}]`);
      if (found) return found;
    }
    return null;
  }
  if (expected && typeof expected === "object") {
    if (!actual || typeof actual !== "object" || Array.isArray(actual)) return `${path}: not an object`;
    const keys = new Set([...Object.keys(expected), ...Object.keys(actual)]);
    for (const key of keys) {
      const found = differs((actual as Record<string, unknown>)[key], (expected as Record<string, unknown>)[key], `${path}.${key}`);
      if (found) return found;
    }
    return null;
  }
  return actual === expected ? null : `${path}: ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`;
}
