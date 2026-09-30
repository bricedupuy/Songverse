import "../zod-config.js";
import { z } from "zod";
import { optional } from "./fields.js";

const note = optional(z.string().max(2000));
const duplicateReason = optional(z.string().max(2000)).describe("Required when similar songs are already in the global catalogue");
const trustLabel = optional(z.string().max(200)).describe('Shown on the global song, e.g. "Official publisher text"');

export const SubmitSongSchema = z.strictObject({
  message: note.describe("A note for the reviewer"),
  duplicateReason,
});

export const PublishSongSchema = z.strictObject({ duplicateReason, trustLabel });

export const ResubmitSchema = z.strictObject({ message: note });

export const ApproveSubmissionSchema = z.strictObject({ notes: note, trustLabel });

export const MergeSubmissionSchema = z.strictObject({
  targetId: z.string().min(1).describe("The global song this one duplicates"),
  notes: note,
});

export const ReviewNotesSchema = z.strictObject({
  notes: z.string().min(1).max(2000).describe("What needs changing, or why it's rejected - shown to the submitter"),
});

export const ListSubmissionsQuerySchema = z.strictObject({
  state: optional(z.enum(["open", "closed"])).describe("Defaults to open"),
});
