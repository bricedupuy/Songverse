import { describe, expect, it } from "vite-plus/test";
import { calendarFeed, icalInstant, icalText } from "../calendar/ical.js";

describe("calendarFeed", () => {
  it("escapes text and writes instants in UTC", () => {
    expect(icalText("a\\b; c, d\ne")).toBe("a\\\\b\\; c\\, d\\ne");
    expect(icalInstant("2026-10-11T08:00:00.000Z")).toBe("20261011T080000Z");
  });
  it("folds lines at 75 octets, never inside a character, with CRLF", () => {
    const feed = calendarFeed([{ uid: "u", start: "2026-10-11T08:00:00Z", end: "2026-10-11T09:00:00Z", title: "é".repeat(60) }], { name: "x", now: "2026-10-01T00:00:00Z" });
    const lines = feed.split("\r\n");
    expect(feed.endsWith("\r\n")).toBe(true);
    for (const line of lines) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    const summary = lines.slice(lines.findIndex((line) => line.startsWith("SUMMARY:"))).filter((line, i) => i === 0 || line.startsWith(" "));
    expect(summary.map((line, i) => (i === 0 ? line : line.slice(1))).join("")).toBe(`SUMMARY:${"é".repeat(60)}`);
  });
});
