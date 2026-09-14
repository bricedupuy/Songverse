import { z } from "zod";
import { SECTION_TYPES } from "../constants/index.js";
import {
  ContributorSnapshotSchema,
  LineSchema,
  NormalizedKeySchema,
  TimeSignatureSchema,
} from "./shared.js";

export const SongDocumentMetadataSchema = z.object({
  title: z.string().min(1),
  alternateTitle: z.string().nullable().optional(),
  language: z.string().min(2),
  ccli: z.string().nullable().optional(),
  copyright: z.string().nullable().optional(),
  copyrightYear: z.number().int().nullable().optional(),
  publisher: z.string().nullable().optional(),
  trustLabel: z.string().nullable().optional(),
  contributors: z.array(ContributorSnapshotSchema).optional(),
});
export type SongDocumentMetadata = z.infer<typeof SongDocumentMetadataSchema>;

export const MusicDefaultsSchema = z.object({
  key: z.string().nullable().optional(),
  keyNormalized: NormalizedKeySchema.nullable().optional(),
  tempo: z.number().positive().nullable().optional(),
  timeSignature: TimeSignatureSchema.nullable().optional(),
  durationSeconds: z.number().positive().nullable().optional(),
});
export type MusicDefaults = z.infer<typeof MusicDefaultsSchema>;

export const ChordEventSchema = z.object({
  beat: z.number().positive(),
  segmentId: z.string().min(1),
});

export const MeasureSchema = z.object({
  index: z.number().int().nonnegative(),
  chordEvents: z.array(ChordEventSchema),
  lyricAnchor: z.string().nullable().optional(),
  cue: z.string().nullable().optional(),
});

export const RhythmMapSchema = z.object({
  measureCount: z.number().int().positive(),
  beatsPerMeasure: z.number().int().positive(),
  measures: z.array(MeasureSchema),
});
export type RhythmMap = z.infer<typeof RhythmMapSchema>;

export const GrooveRefSchema = z.object({
  styleId: z.string().min(1),
  variant: z.string().min(1),
  tempoRelative: z.number().positive().default(1.0),
});
export type GrooveRef = z.infer<typeof GrooveRefSchema>;

export const SectionSchema = z.object({
  id: z.string().min(1),
  type: z.enum(SECTION_TYPES),
  label: z.string().nullable().optional(),
  lines: z.array(LineSchema),
  rhythmMap: RhythmMapSchema.nullable().optional(),
  groove: GrooveRefSchema.nullable().optional(),
});
export type Section = z.infer<typeof SectionSchema>;

export const SongDocumentSchema = z.object({
  $schema: z.literal("song-document/v1"),
  metadata: SongDocumentMetadataSchema,
  defaults: MusicDefaultsSchema,
  sections: z.array(SectionSchema),
});
export type SongDocument = z.infer<typeof SongDocumentSchema>;

/**
 * Validates and parses a SongDocument. Throws a ZodError with a readable
 * path on failure — callers (NestJS pipe, client-side editor) decide how to
 * surface it.
 */
export function parseSongDocument(input: unknown): SongDocument {
  return SongDocumentSchema.parse(input);
}

export function safeParseSongDocument(input: unknown) {
  return SongDocumentSchema.safeParse(input);
}

/**
 * Collects every stable ID (section/line/segment/chord) present in a
 * SongDocument. Used by the ID-stability test and by diff/freeze detection
 * in Arrangements.
 */
export function collectSongDocumentIds(doc: SongDocument): {
  sectionIds: Set<string>;
  lineIds: Set<string>;
  segmentIds: Set<string>;
  chordIds: Set<string>;
} {
  const sectionIds = new Set<string>();
  const lineIds = new Set<string>();
  const segmentIds = new Set<string>();
  const chordIds = new Set<string>();

  for (const section of doc.sections) {
    sectionIds.add(section.id);
    for (const line of section.lines) {
      lineIds.add(line.id);
      for (const segment of line.segments) {
        segmentIds.add(segment.id);
        if (segment.chord) {
          chordIds.add(segment.chord.id);
        }
      }
    }
  }

  return { sectionIds, lineIds, segmentIds, chordIds };
}
