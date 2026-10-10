import "../zod-config.js";
import { z } from "zod";
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
