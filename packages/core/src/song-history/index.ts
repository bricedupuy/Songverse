import type { SongDocumentV2 } from "../schemas/song-document-v2.js";

/**
 * A song version as one save left it (issue #71): the chart, the song's
 * details and its credits - what its history keeps and can restore. Tags,
 * files, links and arrangements aren't part of it.
 */
export interface SongSnapshot {
  $schema: "song-snapshot/v1";
  /** The chart; the document's revision is left out (a restore moves it on). */
  chart: Pick<SongDocumentV2, "defaults" | "sections" | "flow">;
  details: SongSnapshotDetails;
  /** Who the song credits, in order, each with their roles ("PERFORMER", "COMPOSER"…). */
  credits: { name: string; roles: string[] }[];
}

export interface SongSnapshotDetails {
  title: string;
  alternateTitle: string | null;
  versionName: string | null;
  sortTitle: string | null;
  language: string;
  album: string | null;
  year: number | null;
  copyright: string | null;
  copyrightYear: number | null;
  publisher: string | null;
  ccli: string | null;
  isrc: string | null;
  reference: string | null;
  notes: string | null;
  capo: number | null;
}

export const SNAPSHOT_DETAIL_FIELDS = [
  "title",
  "alternateTitle",
  "versionName",
  "sortTitle",
  "language",
  "album",
  "year",
  "copyright",
  "copyrightYear",
  "publisher",
  "ccli",
  "isrc",
  "reference",
  "notes",
  "capo",
] as const satisfies readonly (keyof SongSnapshotDetails)[];

/** What a save changed: the chart's music, its details (key and tempo included), its credits. */
export type SongChange = "chart" | "details" | "credits";

/** A song version's row, as far as a snapshot needs it. */
export interface SnapshotSource extends SongSnapshotDetails {
  document: SongDocumentV2;
  contributors: { source: string | null; roles: string[] }[];
}

export function songSnapshot(song: SnapshotSource): SongSnapshot {
  const details = Object.fromEntries(SNAPSHOT_DETAIL_FIELDS.map((field) => [field, song[field] ?? null])) as unknown as SongSnapshotDetails;
  return {
    $schema: "song-snapshot/v1",
    chart: { defaults: song.document.defaults, sections: song.document.sections, flow: song.document.flow },
    details,
    credits: song.contributors.filter((c) => c.source).map((c) => ({ name: c.source!, roles: [...c.roles] })),
  };
}

/** Deep equality, ignoring key order (a snapshot read back from Postgres' jsonb has its keys reordered) and treating a missing value as null. */
function same(a: unknown, b: unknown): boolean {
  if (a === undefined) a = null;
  if (b === undefined) b = null;
  if (a === b) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) return a.length === (b as unknown[]).length && a.every((item, index) => same(item, (b as unknown[])[index]));
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  return [...keys].every((key) => same((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]));
}

/** The details that differ, key, tempo, time signature and duration (from the chart's defaults) included. */
export function detailChanges(before: SongSnapshot, after: SongSnapshot): { field: string; before: string; after: string }[] {
  const shown = (value: unknown): string => (value === null || value === undefined || value === "" ? "" : String(value));
  const changes: { field: string; before: string; after: string }[] = [];
  for (const field of SNAPSHOT_DETAIL_FIELDS) {
    if (!same(before.details[field], after.details[field])) changes.push({ field, before: shown(before.details[field]), after: shown(after.details[field]) });
  }
  const time = (d: SongDocumentV2["defaults"]) => (d.timeSignature ? `${d.timeSignature.numerator}/${d.timeSignature.denominator}` : "");
  const defaults: [string, (d: SongDocumentV2["defaults"]) => unknown][] = [
    ["key", (d) => d.key],
    ["tempo", (d) => d.tempo],
    ["timeSignature", time],
    ["durationSeconds", (d) => d.durationSeconds],
  ];
  for (const [field, read] of defaults) {
    const a = read(before.chart.defaults);
    const b = read(after.chart.defaults);
    if (!same(a, b)) changes.push({ field, before: shown(a), after: shown(b) });
  }
  return changes;
}

/** What changed between two snapshots. */
export function snapshotChanges(before: SongSnapshot, after: SongSnapshot): SongChange[] {
  const changes: SongChange[] = [];
  if (!same(before.chart.sections, after.chart.sections) || !same(before.chart.flow, after.chart.flow)) changes.push("chart");
  if (detailChanges(before, after).length > 0) changes.push("details");
  if (!same(before.credits, after.credits)) changes.push("credits");
  return changes;
}

export type LineDiff = { kind: "same" | "added" | "removed"; text: string }[];

/**
 * Lines of `after` against `before`, in order: kept, added or removed
 * (the longest common subsequence, so a changed line shows as removed
 * then added).
 */
export function diffLines(before: string[], after: string[]): LineDiff {
  // Common ends first: most edits touch a few lines in the middle.
  let start = 0;
  while (start < before.length && start < after.length && before[start] === after[start]) start++;
  let end = 0;
  while (end < before.length - start && end < after.length - start && before[before.length - 1 - end] === after[after.length - 1 - end]) end++;
  const a = before.slice(start, before.length - end);
  const b = after.slice(start, after.length - end);

  const table = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      table[i]![j] = a[i] === b[j] ? table[i + 1]![j + 1]! + 1 : Math.max(table[i + 1]![j]!, table[i]![j + 1]!);
    }
  }
  const middle: LineDiff = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      middle.push({ kind: "same", text: a[i]! });
      i++;
      j++;
    } else if (table[i + 1]![j]! >= table[i]![j + 1]!) {
      middle.push({ kind: "removed", text: a[i++]! });
    } else {
      middle.push({ kind: "added", text: b[j++]! });
    }
  }
  while (i < a.length) middle.push({ kind: "removed", text: a[i++]! });
  while (j < b.length) middle.push({ kind: "added", text: b[j++]! });

  return [
    ...before.slice(0, start).map((text) => ({ kind: "same" as const, text })),
    ...middle,
    ...before.slice(before.length - end).map((text) => ({ kind: "same" as const, text })),
  ];
}

/**
 * Only the changed lines of a diff, with `context` unchanged lines around
 * each run; `null` stands for the unchanged lines left out between them.
 */
export function diffHunks(diff: LineDiff, context = 2): (LineDiff[number] | null)[] {
  const keep = diff.map(() => false);
  diff.forEach((line, index) => {
    if (line.kind === "same") return;
    for (let k = Math.max(0, index - context); k <= Math.min(diff.length - 1, index + context); k++) keep[k] = true;
  });
  if (!keep.includes(true)) return [];
  const out: (LineDiff[number] | null)[] = [];
  diff.forEach((line, index) => {
    if (keep[index]) out.push(line);
    else if (out[out.length - 1] !== null) out.push(null);
  });
  return out;
}
