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
    .union([z.literal(""), schema], {
      // Not "Invalid input": what's wrong with the value, as the field's own schema says it.
      error: (issue) => (issue.code === "invalid_union" ? issue.errors[1]?.[0]?.message : undefined),
    })
    .transform((value) => (value === "" ? undefined : value) as z.output<T> | undefined)
    .optional();

/** A number in a form field ("92.5"). */
const formNumber = (field: string, min: number, max: number) =>
  z
    .string()
    .trim()
    .regex(/^-?\d+(\.\d+)?$/, { message: `${field} must be a number` })
    .transform(Number)
    .pipe(z.number().min(min).max(max));

/** A multitrack's id (issue #123): made by the app that starts one, the same for every file of it. */
const multitrackId = z.string().regex(/^[A-Za-z0-9_-]{8,40}$/, { message: "multitrackId must be 8 to 40 letters, digits, - or _" });
const multitrackName = z.string().trim().max(60);
/** "4/4", "6/8", "7/8"… */
export const TIME_SIGNATURE_PATTERN = /^([1-9]|1[0-9])\/(1|2|4|8|16)$/;
const timeSignature = z.string().trim().regex(TIME_SIGNATURE_PATTERN, { message: "recordingTimeSignature must read like 4/4 or 6/8" });

/** The form fields sent with an uploaded file (multipart); an audio file's recording details as with PATCH. */
export const UploadAttachmentSchema = z.strictObject({
  type: z.enum(ATTACHMENT_TYPES),
  stemPart: formField(z.enum(STEM_PARTS)),
  visibility: formField(visibility),
  teamId: formField(z.string()),
  multitrackId: formField(multitrackId),
  multitrackName: formField(multitrackName),
  recordingKey: formField(z.string().trim().max(12)),
  recordingTempo: formField(formNumber("recordingTempo", 20, 400)),
  recordingTimeSignature: formField(timeSignature),
  recordingFirstBeat: formField(formNumber("recordingFirstBeat", 0, 600)),
});

/** What's left out stays as it is; null clears it. */
export const UpdateAttachmentSchema = z.strictObject({
  stemPart: z.enum(STEM_PARTS).nullable().optional(),
  recordingKey: z.string().max(12).nullable().optional(),
  recordingTempo: z.number().min(20).max(400).nullable().optional(),
  recordingFirstBeat: z.number().min(0).max(600).nullable().optional(),
  recordingTimeSignature: timeSignature.nullable().optional(),
  /** Null: the song's original stems. */
  multitrackId: multitrackId.nullable().optional(),
  multitrackName: multitrackName.transform((value) => value || null).nullable().optional(),
  visibility: optional(visibility),
  teamId: optional(z.string()),
});
export type UpdateAttachmentRequest = z.input<typeof UpdateAttachmentSchema>;

export const BULK_UPLOAD_TYPES = ["CHORDPRO", "PDF"] as const;
export type BulkUploadTypeValue = (typeof BULK_UPLOAD_TYPES)[number];

export const BulkUploadCommitSchema = z.strictObject({ type: z.enum(BULK_UPLOAD_TYPES) });

export const BulkUploadPreviewSchema = z.strictObject({ filenames: z.array(z.string()).min(1) });
