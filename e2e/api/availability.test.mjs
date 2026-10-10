// Availability for a team's event dates (issue #235): each member answers
// a date Available, If needed or Not available, with a note only they and
// the team's admins see; days away answer Not available for every date in
// them across all their teams, unless a date was answered; no answer is
// never Available. Admins see everyone's answers and counts, and answer
// for a member. "My calendar" lists one's dates across teams.
import { stamp, sql, check, user, call, finish } from "../lib/harness.mjs";

const today = new Date().toISOString().slice(0, 10);
const plus = (days) => new Date(Date.parse(`${today}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10);

const admin = await user("avail admin");
const singer = await user("avail singer");
const drummer = await user("avail drummer");
const outsider = await user("avail outsider");
const teamA = (await call(admin, "POST", "/teams", { name: `Avail A ${stamp}` })).body;
const teamB = (await call(admin, "POST", "/teams", { name: `Avail B ${stamp}` })).body;
const join = (team, who, n) => sql(`insert into "TeamMembership" (id, "teamId", "userId", role, "joinedAt", "updatedAt") values ('tma${n}${stamp}', '${team.id}', '${who.id}', 'MEMBER', now(), now())`);
join(teamA, singer, 1);
join(teamA, drummer, 2);
join(teamB, singer, 3);

const weekly = (await call(admin, "POST", `/teams/${teamA.id}/events`, { title: "Sunday", date: plus(2), startTime: "10:00", timeZone: "UTC", repeat: { everyWeeks: 1 } })).body;
const rehearsal = (await call(admin, "POST", `/teams/${teamB.id}/events`, { title: "Rehearsal B", date: plus(4), startTime: "19:00", timeZone: "UTC" })).body;
const first = plus(2);
const second = plus(9);
const base = `/teams/${teamA.id}/events/${weekly.id}/dates`;

// --- answering
let r = await call(singer, "GET", `/teams/${teamA.id}/event-dates?from=${today}&to=${plus(20)}`);
check("no answer yet: none, never Available; a member sees no counts", r.body[0].myAnswer.answer === null && r.body[0].counts === null, JSON.stringify(r.body[0].myAnswer));
r = await call(singer, "PUT", `${base}/${first}/answer`, { answer: "AVAILABLE", note: "Keys only" });
check("a member answers Available, with a note", r.status === 200 && r.body.answer === "AVAILABLE" && r.body.note === "Keys only", JSON.stringify(r.body));
r = await call(singer, "PUT", `${base}/${first}/answer`, { answer: "MAYBE" });
check("an answer that isn't one", r.status === 400, String(r.status));
r = await call(singer, "PUT", `${base}/${plus(3)}/answer`, { answer: "AVAILABLE" });
check("a day the event isn't on", r.status === 404, String(r.status));
r = await call(outsider, "PUT", `${base}/${first}/answer`, { answer: "AVAILABLE" });
check("someone outside the team can't answer", r.status === 403, String(r.status));
r = await call(drummer, "PUT", `${base}/${first}/answer`, { answer: "IF_NEEDED" });
check("If needed", r.status === 200 && r.body.answer === "IF_NEEDED");
r = await call(drummer, "GET", `/teams/${teamA.id}/event-dates?from=${first}&to=${first}`);
check("a member sees their own answer, not the others'", r.body[0].myAnswer.answer === "IF_NEEDED" && r.body[0].counts === null && !JSON.stringify(r.body).includes("Keys only"));
r = await call(drummer, "GET", `${base}/${first}/answers`);
check("a member can't see everyone's answers", r.status === 403, String(r.status));

// --- days away, across teams
r = await call(singer, "POST", "/users/me/away", { from: plus(8), to: plus(10), note: "Holidays" });
const away = r.body;
check("days away", r.status === 201 && away.from === plus(8));
r = await call(singer, "POST", "/users/me/away", { from: plus(10), to: plus(8) });
check("…ending before they start: refused", r.status === 400, String(r.status));
r = await call(singer, "GET", `/teams/${teamA.id}/event-dates?from=${second}&to=${second}`);
check("a date in them reads Not available, away", r.body[0].myAnswer.answer === "UNAVAILABLE" && r.body[0].myAnswer.away === true, JSON.stringify(r.body[0].myAnswer));
r = await call(singer, "PUT", `${base}/${second}/answer`, { answer: "AVAILABLE", note: "Back early" });
r = await call(singer, "GET", `/teams/${teamA.id}/event-dates?from=${second}&to=${second}`);
check("…answering that date wins over being away", r.body[0].myAnswer.answer === "AVAILABLE" && r.body[0].myAnswer.away === false);
await call(singer, "DELETE", `${base}/${second}/answer`);
r = await call(singer, "GET", `/teams/${teamA.id}/event-dates?from=${second}&to=${second}`);
check("…taken back: away again", r.body[0].myAnswer.answer === "UNAVAILABLE" && r.body[0].myAnswer.away);

// --- the admins' view
r = await call(admin, "GET", `/teams/${teamA.id}/event-dates?from=${first}&to=${second}`);
const [c1, c2] = r.body.map((d) => d.counts);
check("an admin sees the counts: no answer counted, not Available", c1.AVAILABLE === 1 && c1.IF_NEEDED === 1 && c1.NONE === 1 && c2.UNAVAILABLE === 1 && c2.NONE === 2, JSON.stringify([c1, c2]));
r = await call(admin, "GET", `${base}/${first}/answers`);
const singerRow = r.body.find((m) => m.userId === singer.id);
check("…and everyone's answer for a date, with their notes", r.status === 200 && r.body.length === 3 && singerRow.answer === "AVAILABLE" && singerRow.note === "Keys only", JSON.stringify(r.body.map((m) => [m.displayName, m.answer, m.note])));
r = await call(admin, "GET", `${base}/${second}/answers`);
check("…away shows, with its note", r.body.find((m) => m.userId === singer.id)?.away === true && r.body.find((m) => m.userId === singer.id)?.note === "Holidays");
r = await call(admin, "PUT", `${base}/${second}/answers/${drummer.id}`, { answer: "AVAILABLE" });
check("an admin answers for a member", r.status === 200 && r.body.byAdmin === true);
r = await call(admin, "GET", `${base}/${second}/answers`);
check("…marked as answered by them", r.body.find((m) => m.userId === drummer.id)?.answeredBy !== null);
r = await call(admin, "PUT", `${base}/${second}/answers/${outsider.id}`, { answer: "AVAILABLE" });
check("…only for members", r.status === 404, String(r.status));
r = await call(drummer, "PUT", `${base}/${second}/answers/${singer.id}`, { answer: "AVAILABLE" });
check("a member can't answer for someone else", r.status === 403, String(r.status));

// --- my calendar: every team's dates
r = await call(singer, "GET", `/users/me/event-dates?from=${today}&to=${plus(10)}`);
const titles = r.body.map((d) => `${d.title}@${d.teamName}`);
check("My calendar: the dates of all one's teams, with one's answers", titles.includes(`Sunday@Avail A ${stamp}`) && titles.includes(`Rehearsal B@Avail B ${stamp}`) && r.body.find((d) => d.date === first).myAnswer.answer === "AVAILABLE", titles.join(" | "));
r = await call(drummer, "GET", `/users/me/event-dates?from=${today}&to=${plus(10)}`);
check("…not the dates of teams one isn't in", !r.body.some((d) => d.eventId === rehearsal.id));

// --- the event changed: answers for dates it no longer falls on go
await call(admin, "PATCH", `/teams/${teamA.id}/events/${weekly.id}`, { date: plus(3) });
check("answers for dates the event left are deleted", sql(`select count(*) from "TeamEventAnswer" where "eventId" = '${weekly.id}'`) === "0");

r = await call(singer, "DELETE", `/users/me/away/${away.id}`);
check("days away removed", r.status === 204);
r = await call(drummer, "DELETE", `/users/me/away/${away.id}`);
check("…only one's own", r.status === 404, String(r.status));

finish();
