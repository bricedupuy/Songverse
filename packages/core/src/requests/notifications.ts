import "../zod-config.js";
import { z } from "zod";
import { NOTIFICATION_KINDS } from "../notifications/index.js";
import { optional, queryInt } from "./fields.js";

/** Someone's notifications (issue #236): newest first, a page at a time. */
export const NotificationsQuerySchema = z.strictObject({
  before: optional(z.string().trim().max(64)).describe("The ID of the last notification already shown: the page after it"),
  limit: optional(queryInt().pipe(z.number().min(1).max(100))).describe("Defaults to 30"),
});

/** Notifications marked read: these, or all of them when `ids` is left out. */
export const MarkNotificationsReadSchema = z.strictObject({
  ids: optional(z.array(z.string().trim().min(1).max(64)).max(200)),
});

/** How each kind of notification reaches someone: a choice left out stays as it was. */
export const UpdateNotificationPreferencesSchema = z.strictObject({
  kinds: z.partialRecord(z.enum(NOTIFICATION_KINDS), z.strictObject({ email: optional(z.boolean()), push: optional(z.boolean()) })),
});
export type UpdateNotificationPreferencesRequest = z.input<typeof UpdateNotificationPreferencesSchema>;

/** PUT /admin/notifications: left out keeps its value; null goes back to the environment variable or the default. */
export const SaveNotificationServerSettingsSchema = z.strictObject({
  emailEnabled: z.boolean().nullable().optional().describe("Notifications sent by email at all (NOTIFICATION_EMAILS)"),
});
export type SaveNotificationServerSettingsRequest = z.input<typeof SaveNotificationServerSettingsSchema>;
