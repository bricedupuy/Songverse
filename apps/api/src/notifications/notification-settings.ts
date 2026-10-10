import { prisma } from "@songverse/db";
import type { SaveNotificationServerSettingsRequest } from "@songverse/core";

const SINGLETON_ID = "singleton";
const EMAIL_ENV = "NOTIFICATION_EMAILS";

export type NotificationSettingSource = "database" | "env" | "default";

function bool(raw: string | undefined): boolean | undefined {
  return raw === "true" || raw === "1" ? true : raw === "false" || raw === "0" ? false : undefined;
}

function resolveEmail(stored: boolean | null | undefined): { value: boolean; source: NotificationSettingSource } {
  if (stored !== null && stored !== undefined) return { value: stored, source: "database" };
  const env = bool(process.env[EMAIL_ENV]);
  if (env !== undefined) return { value: env, source: "env" };
  // Off: Resend's free tier caps what's sent, and account mail must get through.
  return { value: false, source: "default" };
}

/**
 * How notifications go out (issue #236): Admin > Notifications' row, then
 * the env var, then the default. Resolved fresh on each use (CLAUDE.md):
 * the API and the Worker share no memory.
 */
export async function getEffectiveNotificationSettings(): Promise<{ emailEnabled: boolean }> {
  const stored = await prisma.notificationSettings.findUnique({ where: { id: SINGLETON_ID } });
  return { emailEnabled: resolveEmail(stored?.emailEnabled).value };
}

/** For Admin > Notifications: each setting's value and where it comes from. */
export async function getNotificationSettingsSummary() {
  const stored = await prisma.notificationSettings.findUnique({ where: { id: SINGLETON_ID } });
  const emailEnabled = { ...resolveEmail(stored?.emailEnabled), env: EMAIL_ENV };
  return {
    source: emailEnabled.source === "database" ? "database" : emailEnabled.source === "env" ? "env" : "none",
    settings: { emailEnabled },
  } as const;
}

/** Saves what's given: left out keeps its value, null clears it (back to the env var or default). */
export async function saveNotificationSettings(input: SaveNotificationServerSettingsRequest): Promise<void> {
  const data = Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined));
  await prisma.notificationSettings.upsert({ where: { id: SINGLETON_ID }, create: { id: SINGLETON_ID, ...data }, update: data });
}

/** Back to the environment variables. */
export async function clearNotificationSettings(): Promise<void> {
  await prisma.notificationSettings.deleteMany({ where: { id: SINGLETON_ID } });
}
