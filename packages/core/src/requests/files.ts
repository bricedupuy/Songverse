import { z } from "zod";
import { STEM_PARTS } from "../stems/index.js";
import { optional } from "./fields.js";

export const ATTACHMENT_TYPES = ["PDF", "CHORDPRO", "MUSICXML", "ABC_NOTATION", "TEXT", "IMAGE", "AUDIO", "OTHER"] as const;
export type AttachmentTypeValue = (typeof ATTACHMENT_TYPES)[number];
export const ATTACHMENT_VISIBILITIES = ["PRIVATE", "TEAM", "SONG", "SHARED"] as const;
export type AttachmentVisibilityValue = (typeof ATTACHMENT_VISIBILITIES)[number];

const visibility = z
  .enum(ATTACHMENT_VISIBILITIES)
  .describe(
    "Who sees it besides you: PRIVATE (nobody, the default), TEAM (teamId's members), SONG (everyone who sees the song) and SHARED (the people the song is shared with) need to manage the song.",
  );

/** A form field can't be left out once it's in the form: an empty one means none. */
const formField = <T extends z.ZodType>(schema: T) =>
  z
    .union([z.literal(""), schema])
    .transform((value) => (value === "" ? undefined : value) as z.output<T> | undefined)
    .optional();

/** The form fields sent with an uploaded file (multipart). */
export const UploadAttachmentSchema = z.strictObject({
  type: z.enum(ATTACHMENT_TYPES),
  stemPart: formField(z.enum(STEM_PARTS)),
  visibility: formField(visibility),
  teamId: formField(z.string()),
});

/** What's left out stays as it is; null clears it. */
export const UpdateAttachmentSchema = z.strictObject({
  stemPart: z.enum(STEM_PARTS).nullable().optional(),
  recordingKey: z.string().max(12).nullable().optional(),
  recordingTempo: z.number().min(20).max(400).nullable().optional(),
  recordingFirstBeat: z.number().min(0).max(600).nullable().optional(),
  visibility: optional(visibility),
  teamId: optional(z.string()),
});
export type UpdateAttachmentRequest = z.input<typeof UpdateAttachmentSchema>;

export const BULK_UPLOAD_TYPES = ["CHORDPRO", "PDF"] as const;
export type BulkUploadTypeValue = (typeof BULK_UPLOAD_TYPES)[number];

export const BulkUploadCommitSchema = z.strictObject({ type: z.enum(BULK_UPLOAD_TYPES) });

export const BulkUploadPreviewSchema = z.strictObject({ filenames: z.array(z.string()).min(1) });
