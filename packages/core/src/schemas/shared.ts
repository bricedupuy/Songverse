import "../zod-config.js";
import { z } from "zod";
import {
  ACCIDENTALS,
  CHORD_QUALITIES,
  CONTRIBUTOR_ROLES,
  KEY_MODES,
  NOTE_ROOTS,
} from "../constants/index.js";

export const NoteRootSchema = z.enum(NOTE_ROOTS);
export const AccidentalSchema = z.enum(ACCIDENTALS).nullable();
export const ChordQualitySchema = z.enum(CHORD_QUALITIES);
export const ContributorRoleSchema = z.enum(CONTRIBUTOR_ROLES);

export const NormalizedKeySchema = z.object({
  root: NoteRootSchema,
  accidental: AccidentalSchema,
  mode: z.enum(KEY_MODES),
});
export type NormalizedKey = z.infer<typeof NormalizedKeySchema>;

export const TimeSignatureSchema = z.object({
  numerator: z.number().int().positive(),
  denominator: z.number().int().positive(),
});
export type TimeSignature = z.infer<typeof TimeSignatureSchema>;

export const NormalizedChordSchema = z.object({
  root: NoteRootSchema,
  accidental: AccidentalSchema,
  quality: ChordQualitySchema,
  extensions: z.array(z.string()),
  bass: NoteRootSchema.nullable(),
  bassAccidental: AccidentalSchema,
});
export type NormalizedChord = z.infer<typeof NormalizedChordSchema>;

export const ChordSchema = z.object({
  id: z.string().min(1),
  raw: z.string().min(1),
  normalized: NormalizedChordSchema.nullable(),
});
export type Chord = z.infer<typeof ChordSchema>;

export const SegmentSchema = z.object({
  id: z.string().min(1),
  lyric: z.string(),
  chord: ChordSchema.nullable().optional(),
});
export type Segment = z.infer<typeof SegmentSchema>;

export const LineSchema = z.object({
  id: z.string().min(1),
  segments: z.array(SegmentSchema),
});
export type Line = z.infer<typeof LineSchema>;
