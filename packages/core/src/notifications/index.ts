import { AVAILABILITY_ANSWERS, type AvailabilityAnswer } from "../calendar/index.js";
import type { Messages } from "../i18n/index.js";

/**
 * What Songverse tells people (issue #236): each notification is a kind and
 * its details, written into words in the reader's language when it's shown
 * or sent (the bell, push, email, the native apps), never stored as text.
 */
export const NOTIFICATION_KINDS = [
  // A date of an event one signed up for is cancelled.
  "EVENT_DATE_CANCELLED",
  // A date one signed up for changed: its time or its title.
  "EVENT_DATE_CHANGED",
  // An event one signed up for (some coming date of it) is deleted.
  "EVENT_CANCELLED",
  // A team admin answered for one (Available, If needed, Not available).
  "ANSWERED_FOR_YOU",
] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

/** A notification's details: what its words are made of. */
export interface NotificationData {
  event?: string;
  /** YYYY-MM-DD. */
  date?: string;
  team?: string;
  /** HH:MM. */
  startTime?: string;
  answer?: AvailabilityAnswer;
  /** Who did it. */
  by?: string;
}

const fill = (template: string, values: Record<string, string>) => template.replace(/\{\{(\w+)\}\}/g, (_, name: string) => values[name] ?? "");

/** A date as a notification names it: "Sun, Oct 12" / "dim. 12 oct.". */
export function notificationDate(date: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`));
}

/** A notification in words: its title and a line under it, in the language of `messages` (`locale` formats the date). */
export function notificationText(kind: NotificationKind, data: NotificationData, messages: Messages, locale: string): { title: string; body: string } {
  const words = messages.notifications.kinds[kind];
  const answers = messages.notifications.answers;
  const values = {
    event: data.event ?? "",
    date: data.date ? notificationDate(data.date, locale) : "",
    team: data.team ?? "",
    time: data.startTime ?? "",
    answer: data.answer && (AVAILABILITY_ANSWERS as readonly string[]).includes(data.answer) ? answers[data.answer] : "",
    by: data.by ?? "",
  };
  return { title: fill(words.title, values), body: fill(words.body, values) };
}

/** Where a notification goes besides the bell (issue #236): by email, by push to one's devices. */
export const NOTIFICATION_CHANNELS = ["email", "push"] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

/** For each kind, whether it goes by each channel. */
export type NotificationPreferences = Record<NotificationKind, Record<NotificationChannel, boolean>>;

/** Until someone chooses: every kind by every channel - they're few, and about dates one plays. */
export function defaultNotificationPreferences(): NotificationPreferences {
  return Object.fromEntries(NOTIFICATION_KINDS.map((kind) => [kind, Object.fromEntries(NOTIFICATION_CHANNELS.map((channel) => [channel, true]))])) as NotificationPreferences;
}

/**
 * Someone's choices as stored (`User.notificationSettings`): `{ kinds: {
 * KIND: { email?, push? } } }`, a choice left out taking the default, and
 * anything else ignored.
 */
export function notificationPreferences(stored: unknown): NotificationPreferences {
  const out = defaultNotificationPreferences();
  const kinds = stored && typeof stored === "object" ? (stored as { kinds?: unknown }).kinds : undefined;
  if (!kinds || typeof kinds !== "object") return out;
  for (const kind of NOTIFICATION_KINDS) {
    const choice = (kinds as Record<string, unknown>)[kind];
    if (!choice || typeof choice !== "object") continue;
    for (const channel of NOTIFICATION_CHANNELS) {
      const on = (choice as Record<string, unknown>)[channel];
      if (typeof on === "boolean") out[kind][channel] = on;
    }
  }
  return out;
}

/** Stored choices with `changes` applied: what's left out stays as it was. */
export function withNotificationChanges(stored: unknown, changes: Partial<Record<NotificationKind, Partial<Record<NotificationChannel, boolean | null>>>>): { kinds: NotificationPreferences } {
  const kinds = notificationPreferences(stored);
  for (const kind of NOTIFICATION_KINDS) for (const channel of NOTIFICATION_CHANNELS) {
    const on = changes[kind]?.[channel];
    if (typeof on === "boolean") kinds[kind][channel] = on;
  }
  return { kinds };
}

/**
 * Notifications in an email (issue #236), in the language of `messages`:
 * one, by its own title, or several at once (an event changed, its dates
 * with it) under one subject. Plain text; the sender makes the HTML.
 */
export function notificationEmail(
  items: { kind: NotificationKind; data: NotificationData }[],
  messages: Messages,
  locale: string,
): { subject: string; lines: { title: string; body: string }[] } {
  const lines = items.map((item) => notificationText(item.kind, item.data, messages, locale));
  const subject = lines.length === 1 ? lines[0]!.title : fill(messages.notifications.email.several, { count: String(lines.length) });
  return { subject, lines };
}
