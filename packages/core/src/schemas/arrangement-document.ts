import { z } from "zod";
import { LineSchema, NormalizedChordSchema, NormalizedKeySchema, TimeSignatureSchema } from "./shared.js";

export const ArrangementDefaultsSchema = z.object({
  key: z.string().nullable().optional(),
  keyNormalized: NormalizedKeySchema.nullable().optional(),
  tempo: z.number().positive().nullable().optional(),
  timeSignature: TimeSignatureSchema.nullable().optional(),
  capo: z.number().int().min(0).max(12).nullable().optional(),
  transposeSteps: z.number().int().nullable().optional(),
  guitarTuning: z.string().nullable().optional(),
  guitarTuningNotes: z.array(z.string()).nullable().optional(),
});
export type ArrangementDefaults = z.infer<typeof ArrangementDefaultsSchema>;

export const KeyOverrideSchema = z.object({
  key: z.string().min(1),
  keyNormalized: NormalizedKeySchema,
  transposeSteps: z.number().int(),
});
export type KeyOverride = z.infer<typeof KeyOverrideSchema>;

const ChordOverrideSchema = z.object({
  type: z.literal("chord"),
  chordId: z.string().min(1),
  raw: z.string().min(1),
  normalized: NormalizedChordSchema.nullable().optional(),
});

const LyricOverrideSchema = z.object({
  type: z.literal("lyric"),
  segmentId: z.string().min(1),
  value: z.string(),
});

const HideLineOverrideSchema = z.object({
  type: z.literal("hide_line"),
  lineId: z.string().min(1),
});

const InsertLineOverrideSchema = z.object({
  type: z.literal("insert_line"),
  afterLineId: z.string().nullable().optional(),
  line: LineSchema,
});

const PerformanceNoteOverrideSchema = z.object({
  type: z.literal("performance_note"),
  lineId: z.string().min(1),
  note: z.string().min(1),
});

export const OverrideSchema = z.discriminatedUnion("type", [
  ChordOverrideSchema,
  LyricOverrideSchema,
  HideLineOverrideSchema,
  InsertLineOverrideSchema,
  PerformanceNoteOverrideSchema,
]);
export type Override = z.infer<typeof OverrideSchema>;

export const ArrangementItemSchema = z.object({
  id: z.string().min(1),
  sectionId: z.string().min(1),
  instanceLabel: z.string().nullable().optional(),
  keyOverride: KeyOverrideSchema.nullable().optional(),
  overrides: z.array(OverrideSchema),
  performanceNote: z.string().nullable().optional(),
  durationOverrideSeconds: z.number().positive().nullable().optional(),
});
export type ArrangementItem = z.infer<typeof ArrangementItemSchema>;

export const ArrangementDocumentSchema = z.object({
  $schema: z.literal("arrangement-document/v1"),
  songVersionId: z.string().min(1),
  songDocumentSchema: z.literal("song-document/v1"),
  frozenAt: z.string().nullable().optional(),
  defaults: ArrangementDefaultsSchema,
  items: z.array(ArrangementItemSchema),
});
export type ArrangementDocument = z.infer<typeof ArrangementDocumentSchema>;

export function parseArrangementDocument(input: unknown): ArrangementDocument {
  return ArrangementDocumentSchema.parse(input);
}

export function safeParseArrangementDocument(input: unknown) {
  return ArrangementDocumentSchema.safeParse(input);
}

/**
 * Detects references from an ArrangementDocument that no longer resolve
 * against a given SongDocument's current IDs — the staleness check that
 * drives the frozen-arrangement flow (arrangement-document-v1.md, "Detecting
 * Staleness").
 */
export function findUnresolvedReferences(
  arrangement: ArrangementDocument,
  currentIds: { sectionIds: Set<string>; lineIds: Set<string>; segmentIds: Set<string>; chordIds: Set<string> },
): string[] {
  const unresolved: string[] = [];

  for (const item of arrangement.items) {
    if (!currentIds.sectionIds.has(item.sectionId)) {
      unresolved.push(`item ${item.id}: sectionId ${item.sectionId} not found`);
    }
    for (const override of item.overrides) {
      switch (override.type) {
        case "chord":
          if (!currentIds.chordIds.has(override.chordId)) {
            unresolved.push(`item ${item.id}: chordId ${override.chordId} not found`);
          }
          break;
        case "lyric":
          if (!currentIds.segmentIds.has(override.segmentId)) {
            unresolved.push(`item ${item.id}: segmentId ${override.segmentId} not found`);
          }
          break;
        case "hide_line":
        case "performance_note":
          if (!currentIds.lineIds.has(override.lineId)) {
            unresolved.push(`item ${item.id}: lineId ${override.lineId} not found`);
          }
          break;
        case "insert_line":
          if (override.afterLineId && !currentIds.lineIds.has(override.afterLineId)) {
            unresolved.push(`item ${item.id}: afterLineId ${override.afterLineId} not found`);
          }
          break;
      }
    }
  }

  return unresolved;
}
