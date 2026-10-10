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
