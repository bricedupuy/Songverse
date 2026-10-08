import "../zod-config.js";
import { z } from "zod";
import { SCREEN_MODES, SCREEN_THEME_TEMPLATES, ScreenThemeRequestSchema } from "../screens/index.js";
import { optional } from "./fields.js";

/** Screens (issue #186): a screen paired by its code, and changed later by whoever paired it. */
const screenFields = {
  name: z.string().trim().min(1, "name must not be empty").max(60),
  mode: z.enum(SCREEN_MODES),
  setlistId: z.string().min(1).max(40),
  /** A saved theme (issue #194); null for none. */
  themeId: z.string().min(1).max(40).nullable(),
  /** A built-in theme by its id ("concert"); null for none. A screen has one or the other, else the default look. */
  themeTemplate: z.enum(SCREEN_THEME_TEMPLATES.map((one) => one.id) as [string, ...string[]]).nullable(),
};

/** POST /screens/pairings/:code/confirm */
export const ConfirmScreenPairingSchema = z.strictObject({
  name: screenFields.name,
  mode: screenFields.mode,
  setlistId: screenFields.setlistId,
  themeId: screenFields.themeId.optional(),
  themeTemplate: screenFields.themeTemplate.optional(),
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
  themeId: screenFields.themeId.optional(),
  themeTemplate: screenFields.themeTemplate.optional(),
});
export type UpdateScreenRequest = z.input<typeof UpdateScreenSchema>;

const themeName = z.string().trim().min(1, "name must not be empty").max(60);

/** POST /screen-themes: a theme of the user's own, or (`teamId`) their team's, which its admins change. */
export const CreateScreenThemeSchema = z.strictObject({
  name: themeName,
  teamId: optional(z.string().min(1).max(40)),
  theme: ScreenThemeRequestSchema,
});
export type CreateScreenThemeRequest = z.input<typeof CreateScreenThemeSchema>;

/** PATCH /screen-themes/:id: a field left out keeps its value. */
export const UpdateScreenThemeSchema = z.strictObject({
  name: optional(themeName),
  theme: optional(ScreenThemeRequestSchema),
});
export type UpdateScreenThemeRequest = z.input<typeof UpdateScreenThemeSchema>;
