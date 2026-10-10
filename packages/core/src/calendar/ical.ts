/**
 * A calendar feed (issue #235): iCalendar (RFC 5545), what Google, Apple,
 * Outlook and the others subscribe to. Each entry is one date, its times in
 * UTC (worked out in the team's time zone by eventDates), so no time zone
 * definitions are needed.
 */

export interface CalendarFeedEntry {
  /** Stable across fetches, so the calendar updates the entry instead of adding another. */
  uid: string;
  /** ISO 8601. */
  start: string;
  end: string;
  title: string;
  location?: string | null;
  description?: string | null;
  url?: string | null;
}

/** Text as iCalendar writes it: backslashes, semicolons, commas and line breaks escaped. */
export function icalText(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

/** An instant as iCalendar writes it in UTC: 20261011T080000Z. */
export function icalInstant(iso: string): string {
  return new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/** A content line folded at 75 octets (UTF-8), the rest on lines starting with a space - never inside a character. */
function fold(line: string): string {
  const encoder = new TextEncoder();
  if (encoder.encode(line).length <= 75) return line;
  const parts: string[] = [];
  let current = "";
  let size = 0;
  for (const char of line) {
    const bytes = encoder.encode(char).length;
    const limit = parts.length === 0 ? 75 : 74;
    if (size + bytes > limit) {
      parts.push(current);
      current = "";
      size = 0;
    }
    current += char;
    size += bytes;
  }
  parts.push(current);
  return parts.join("\r\n ");
}

/**
 * A whole feed: its name, how often calendars should look again
 * (`refreshMinutes`), and its entries. `now` stamps them (DTSTAMP).
 */
export function calendarFeed(entries: CalendarFeedEntry[], options: { name: string; now: string; refreshMinutes?: number }): string {
  const refresh = `PT${options.refreshMinutes ?? 60}M`;
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Songverse//Calendar//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${icalText(options.name)}`,
    `NAME:${icalText(options.name)}`,
    `REFRESH-INTERVAL;VALUE=DURATION:${refresh}`,
    `X-PUBLISHED-TTL:${refresh}`,
  ];
  for (const entry of entries) {
    lines.push(
      "BEGIN:VEVENT",
      `UID:${icalText(entry.uid)}`,
      `DTSTAMP:${icalInstant(options.now)}`,
      `DTSTART:${icalInstant(entry.start)}`,
      `DTEND:${icalInstant(entry.end)}`,
      `SUMMARY:${icalText(entry.title)}`,
      ...(entry.location ? [`LOCATION:${icalText(entry.location)}`] : []),
      ...(entry.description ? [`DESCRIPTION:${icalText(entry.description)}`] : []),
      ...(entry.url ? [`URL:${entry.url}`] : []),
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return `${lines.map(fold).join("\r\n")}\r\n`;
}
