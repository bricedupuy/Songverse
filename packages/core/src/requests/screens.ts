import "../zod-config.js";
import { z } from "zod";
import { SCREEN_MODES } from "../screens/index.js";
import { optional } from "./fields.js";

/** Screens (issue #186): a screen paired by its code, and changed later by whoever paired it. */
const screenFields = {
  name: z.string().trim().min(1, "name must not be empty").max(60),
  mode: z.enum(SCREEN_MODES),
  setlistId: z.string().min(1).max(40),
};

/** POST /screens/pairings/:code/confirm */
export const ConfirmScreenPairingSchema = z.strictObject({
  name: screenFields.name,
  mode: screenFields.mode,
  setlistId: screenFields.setlistId,
});
export type ConfirmScreenPairingRequest = z.input<typeof ConfirmScreenPairingSchema>;

/** POST /screens/pairings/:id/claim: the screen asks for its token. */
export const ClaimScreenPairingSchema = z.strictObject({
  secret: z.string().min(16).max(200),
});

/** PATCH /screens/:id: a field left out keeps its value; setlistId null leaves it without a set. */
export const UpdateScreenSchema = z.strictObject({
  name: optional(screenFields.name),
  mode: optional(screenFields.mode),
  setlistId: screenFields.setlistId.nullable().optional(),
});
export type UpdateScreenRequest = z.input<typeof UpdateScreenSchema>;
