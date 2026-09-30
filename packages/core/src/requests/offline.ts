import "../zod-config.js";
import { z } from "zod";
import { optional } from "./fields.js";

export const PIN_KINDS = ["SET", "SONG", "SONGBOOK"] as const;
export type PinKind = (typeof PIN_KINDS)[number];

const knownCopy = z.strictObject({
  id: z.string().max(64),
  version: z.string().max(64).describe("The version of the copy the device has (from an earlier sync or offline download)"),
});

export const OfflineSyncSchema = z.strictObject({
  days: optional(z.number().int().min(1).max(60)).describe("How many days ahead count as upcoming (default 14)"),
  known: optional(z.array(knownCopy).max(200)).describe("The sets the device keeps, with their versions"),
  knownSongs: optional(z.array(knownCopy).max(5000)).describe("The songs the device keeps, with their versions"),
  knownSongbooks: optional(z.array(knownCopy).max(200)).describe("The songbooks the device keeps, with their versions"),
  fingerprint: optional(z.string().max(128)).describe(
    "offlineFingerprint() of what the device keeps (issue #121): the answer is only whether it's still what it should keep",
  ),
});
export type OfflineSyncRequest = z.input<typeof OfflineSyncSchema>;

export const OfflinePinSchema = z.strictObject({
  kind: z.enum(PIN_KINDS),
  targetId: z.string().max(64),
  includeAudio: optional(z.boolean()).describe("Download its audio files too (off by default)"),
});

export const OfflineSongsSchema = z.strictObject({
  ids: z.array(z.string()).max(100),
});
