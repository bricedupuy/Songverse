import "../zod-config.js";
import { z } from "zod";
import { CAPO_DISPLAY_MODES, CHORD_NOTATIONS, INSTRUMENTS, LIVE_VIEWS, SUPPORTED_LOCALES, TEAM_ROLES, TECH_ROLES } from "../constants/index.js";
import { optional, requiredText } from "./fields.js";

/** PATCH /users/me */
export const UpdateUserSchema = z.strictObject({
  locale: optional(z.enum(SUPPORTED_LOCALES)),
  displayName: optional(requiredText(80)),
  instruments: optional(z.array(z.enum(INSTRUMENTS)).max(INSTRUMENTS.length)),
  techRoles: optional(z.array(z.enum(TECH_ROLES)).max(TECH_ROLES.length)),
  capoDisplayMode: optional(z.enum(CAPO_DISPLAY_MODES)),
  chordNotation: optional(z.enum(CHORD_NOTATIONS)),
  liveView: optional(z.enum(LIVE_VIEWS)),
});
export type UpdateUserRequest = z.input<typeof UpdateUserSchema>;

export const MAX_TRANSFER_RETENTION_DAYS = 365;
export const DEFAULT_TRANSFER_RETENTION_DAYS = 30;

/** Admin > Users: each field is optional; omitted fields are left unchanged. */
export const UpdateUserByAdminSchema = z.strictObject({
  banned: optional(z.boolean()),
  banReason: optional(z.string().max(500)),
});

export const DeleteUserSchema = z.strictObject({
  contentAction: z.enum(["delete", "transfer"]),
  retentionDays: optional(z.number().int().min(1).max(MAX_TRANSFER_RETENTION_DAYS)).describe(
    `How long the transfer link works (days, default ${DEFAULT_TRANSFER_RETENTION_DAYS})`,
  ),
});

/**
 * PUT /admin/security (issue #113): each field left out keeps its value;
 * null clears it (back to its env var, else the default).
 */
export const SaveSecuritySettingsSchema = z.strictObject({
  rateLimitEnabled: z.boolean().nullable().optional(),
  rateLimitPerMinute: z.number().int().min(10).max(100_000).nullable().optional(),
  rateLimitAnonymousPerMinute: z.number().int().min(10).max(100_000).nullable().optional(),
  rateLimitHeavyPerMinute: z.number().int().min(1).max(10_000).nullable().optional(),
  trustedProxies: z.number().int().min(0).max(10).nullable().optional(),
  apiDocsPublic: z.boolean().nullable().optional(),
  contentSecurityPolicy: z.enum(["ENFORCE", "REPORT_ONLY", "OFF"]).nullable().optional(),
});
export type SaveSecuritySettingsRequest = z.input<typeof SaveSecuritySettingsSchema>;

/** PUT /admin/storage/limits: a field left out keeps its value; null goes back to the built-in default. */
export const SaveStorageLimitsSchema = z.strictObject({
  defaultLimitMb: z.number().int().min(0).max(1_000_000).nullable().optional().describe("A user's, when no role sets one (MB)"),
  defaultTeamLimitMb: z.number().int().min(0).max(1_000_000).nullable().optional().describe("A team's pool, when no role sets one (MB)"),
});
export type SaveStorageLimitsRequest = z.input<typeof SaveStorageLimitsSchema>;

/**
 * Every field is optional and independently omittable, so an admin can
 * change one without re-entering a secret (write-only, never sent back).
 */
export const SaveAuthConfigSchema = z.strictObject({
  resendApiKey: optional(z.string().max(200)),
  emailFrom: optional(z.string().max(200)),
  googleClientId: optional(z.string().max(200)),
  googleClientSecret: optional(z.string().max(200)),
});

export const SaveStorageConfigSchema = z.strictObject({
  accountId: optional(z.string().max(200)),
  accessKeyId: optional(z.string().max(200)),
  secretAccessKey: optional(z.string().max(500)),
  bucket: optional(z.string().max(200)),
  endpoint: optional(z.string().max(500)),
});

export const CreateTeamSchema = z.strictObject({
  name: z.string().min(2).max(100),
  slug: optional(z.string().regex(/^[a-z0-9-]+$/, "slug must be lowercase letters, numbers, and hyphens")),
  description: optional(z.string().max(500)),
});

export const UpdateMemberRoleSchema = z.strictObject({ role: z.enum(TEAM_ROLES) });

export const CreateInviteLinkSchema = z.strictObject({
  role: optional(z.enum(TEAM_ROLES)),
  expiresInDays: optional(z.number().int().min(1).max(365)),
  maxUses: optional(z.number().int().min(1)),
});

/** Ask someone to connect: by their email, or (someone from your teams) their user id. */
export const ConnectionRequestSchema = z.strictObject({
  email: optional(z.string().trim().toLowerCase().max(320).pipe(z.email())),
  userId: optional(z.string()),
});

export const ShareSchema = z.strictObject({ canEdit: z.boolean() });
