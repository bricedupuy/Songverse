import "../zod-config.js";
import { z } from "zod";
import { AVAILABILITY_ANSWERS, isCalendarDate, isTimeOfDay, isTimeZone, SETS_AHEAD_WEEKS } from "../calendar/index.js";
import { clearableText, optional, requiredText } from "./fields.js";

/** A team's calendar (issue #235): its events and their dates. */

const date = (name: string) => z.string().refine(isCalendarDate, `${name} must be a date, YYYY-MM-DD`);
const time = (name: string) => z.string().refine(isTimeOfDay, `${name} must be a time, HH:MM`);
const timeZone = z.string().refine(isTimeZone, "timeZone must be a time zone, like Europe/Paris");
const duration = z.number().int().min(5).max(24 * 60);

const RepeatSchema = z.strictObject({
  everyWeeks: z.number().int().min(1).max(52).describe("Every n weeks, on the weekday of the event's first date"),
  until: optional(date("repeat.until")).describe("Its last date (included); left out, it goes on"),
});

export const CreateTeamEventSchema = z.strictObject({
  title: requiredText(120),
  date: date("date").describe("Its first date, YYYY-MM-DD"),
  startTime: time("startTime").describe("HH:MM, in the time zone"),
  durationMinutes: optional(duration).describe("90 when left out"),
  timeZone: timeZone.describe("An IANA time zone (Europe/Paris): times stay the same across daylight saving"),
  place: optional(z.string().trim().max(200)),
  note: optional(z.string().trim().max(1000)),
  repeat: optional(RepeatSchema).describe("Left out: a one-off"),
});
export type CreateTeamEventRequest = z.input<typeof CreateTeamEventSchema>;

/** Omitted fields are left as they are; null (or "") clears. Dates already passed keep their sets. */
export const UpdateTeamEventSchema = z.strictObject({
  title: requiredText(120).optional(),
  date: date("date").optional(),
  startTime: time("startTime").optional(),
  durationMinutes: duration.optional(),
  timeZone: timeZone.optional(),
  place: clearableText(200),
  note: clearableText(1000),
  repeat: RepeatSchema.nullable().optional().describe("null makes it a one-off"),
});
export type UpdateTeamEventRequest = z.input<typeof UpdateTeamEventSchema>;

/** One date of an event changed by itself. null (or "") goes back to the event's. */
export const UpdateTeamEventDateSchema = z.strictObject({
  cancelled: z.boolean().optional(),
  startTime: time("startTime").nullable().optional(),
  title: clearableText(120),
});
export type UpdateTeamEventDateRequest = z.input<typeof UpdateTeamEventDateSchema>;

export const TeamEventDatesQuerySchema = z.strictObject({
  from: date("from"),
  to: date("to"),
});
export type TeamEventDatesQuery = z.input<typeof TeamEventDatesQuerySchema>;

export const UpdateTeamCalendarSchema = z.strictObject({
  setsAheadWeeks: z
    .number()
    .int()
    .min(SETS_AHEAD_WEEKS.min)
    .max(SETS_AHEAD_WEEKS.max)
    .describe("How many weeks ahead each date's set is made, 1 to 52"),
});
export type UpdateTeamCalendarRequest = z.input<typeof UpdateTeamCalendarSchema>;

/** Someone's answer for a date (issue #235); the note is seen by them and the team's admins only. */
export const AnswerEventDateSchema = z.strictObject({
  answer: z.enum(AVAILABILITY_ANSWERS).describe("AVAILABLE, IF_NEEDED (free if asked) or UNAVAILABLE"),
  note: clearableText(300).describe('"Can only play keys", "arriving late"; seen by the team\'s admins'),
});
export type AnswerEventDateRequest = z.input<typeof AnswerEventDateSchema>;

/** Days someone is away, across all their teams: every date in them reads Not available unless answered. */
export const CreateAwaySchema = z
  .strictObject({
    from: date("from"),
    to: date("to"),
    note: optional(z.string().trim().max(300)),
  })
  .refine((range) => range.to >= range.from, { message: "to must not be before from", path: ["to"] });
export type CreateAwayRequest = z.input<typeof CreateAwaySchema>;

export const MyEventDatesQuerySchema = TeamEventDatesQuerySchema;
