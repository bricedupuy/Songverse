// A song's history (issue #71): every save kept - the chart, details and
// credits as it left them - with who and when; saves by the same person a
// few minutes apart as one entry; restoring an entry as a new save.
import { stamp, sql, check, user, call, api, finish } from "../lib/harness.mjs";

const owner = await user("Owner");
const member = await user("Member");
const stranger = await user("Stranger");
const chart = (words) => `{start_of_verse}\n[G]${words}\n{end_of_verse}\n{start_of_chorus}\n[C]The chorus\n{end_of_chorus}\n`;
// Saves before this one no longer merge with it: as if a quarter of an hour went by.
const later = (songId) => sql(`update "SongVersionRevision" set "updatedAt" = "updatedAt" - interval '15 minutes', "createdAt" = "createdAt" - interval '15 minutes' where "songVersionId" = '${songId}'`);

const song = await api(owner, "POST", "/song-versions", {
  title: `History ${stamp}`,
  language: "en",
  artists: ["First Artist"],
  key: "G",
  content: chart("Amazing grace"),
  contentFormat: "CHORDPRO",
});
let r = await call(owner, "GET", `/song-versions/${song.id}/history`);
check("a new song's history: created, by its author", r.status === 200 && r.body.length === 1 && r.body[0].kind === "CREATED" && r.body[0].author?.id === owner.id, JSON.stringify(r.body));
const created = r.body[0];

// --- edits
let detail = await api(owner, "GET", `/song-versions/${song.id}`);
const verseId = detail.documentJson.sections[0].id;
later(song.id);
r = await call(owner, "PATCH", `/song-versions/${song.id}`, { content: chart("Amazing grace, how sweet"), revision: detail.documentJson.revision });
check("saved", r.status === 200, JSON.stringify(r.body));
detail = r.body;
check("the verse kept its ID", detail.documentJson.sections[0].id === verseId);
r = await call(owner, "PATCH", `/song-versions/${song.id}`, { title: `History ${stamp} (live)`, key: "A" });
let history = await api(owner, "GET", `/song-versions/${song.id}/history`);
check("two saves minutes apart by the same person: one entry, with both changes", history.length === 2 && history[0].kind === "EDITED" && history[0].changes.join() === "chart,details", JSON.stringify(history.map((h) => [h.kind, h.changes])));

later(song.id);
await call(owner, "PATCH", `/song-versions/${song.id}`, { artists: ["First Artist", "Second Artist"] });
history = await api(owner, "GET", `/song-versions/${song.id}/history`);
check("a later save: a new entry, credits", history.length === 3 && history[0].changes.join() === "credits", JSON.stringify(history.map((h) => h.changes)));

const tags = sql(`select id from "Tag" where scope='GLOBAL' and "isApproved" limit 1`);
await call(owner, "PATCH", `/song-versions/${song.id}`, { tagIds: [tags] });
history = await api(owner, "GET", `/song-versions/${song.id}/history`);
check("tags aren't part of it: no entry", history.length === 3);

// --- an entry, with the one before
const edited = history[1];
r = await call(owner, "GET", `/song-versions/${song.id}/history/${edited.id}`);
check(
  "an entry shows the song as it left it, and as it was before",
  r.status === 200 &&
    r.body.snapshot.$schema === "song-snapshot/v1" &&
    r.body.snapshot.details.title === `History ${stamp} (live)` &&
    r.body.snapshot.chart.defaults.key === "A" &&
    r.body.previous.details.title === `History ${stamp}` &&
    r.body.previous.chart.sections[0].lines[0].text === "Amazing grace",
  JSON.stringify(r.body).slice(0, 300),
);
r = await call(owner, "GET", `/song-versions/${song.id}/history/${created.id}`);
check("the first has nothing before it", r.status === 200 && r.body.previous === null && r.body.snapshot.credits.length === 1);

// --- restore
r = await call(owner, "POST", `/song-versions/${song.id}/history/${history[0].id}/restore`);
check("the latest entry is the song as it is: nothing to restore", r.status === 400, String(r.status));
const before = await api(owner, "GET", `/song-versions/${song.id}`);
r = await call(owner, "POST", `/song-versions/${song.id}/history/${created.id}/restore`);
check("restored", r.status === 200, JSON.stringify(r.body).slice(0, 200));
const restored = r.body;
check(
  "the chart, details and credits as they were",
  restored.title === `History ${stamp}` &&
    restored.documentJson.defaults.key === "G" &&
    restored.documentJson.sections[0].lines[0].text === "Amazing grace" &&
    restored.contributors.map((c) => c.source).join() === "First Artist",
  JSON.stringify({ title: restored.title, key: restored.documentJson.defaults.key, credits: restored.contributors.map((c) => c.source) }),
);
check("the chart's IDs as they were", restored.documentJson.sections[0].id === verseId);
check("as a new save: the revision moved on", restored.documentJson.revision === before.documentJson.revision + 1);
check("tags left alone", restored.tags.length === 1);
history = await api(owner, "GET", `/song-versions/${song.id}/history`);
check(
  "the restore is in the history, naming what it brought back",
  history.length === 4 && history[0].kind === "RESTORED" && history[0].restoredFrom?.id === created.id && history[0].changes.join() === "chart,details,credits",
  JSON.stringify(history[0]),
);
r = await call(owner, "POST", `/song-versions/${song.id}/history/${history[1].id}/restore`);
check("and can itself be undone", r.status === 200 && r.body.title === `History ${stamp} (live)` && r.body.contributors.length === 2);
r = await call(owner, "PATCH", `/song-versions/${song.id}`, { notes: "Straight after a restore" });
history = await api(owner, "GET", `/song-versions/${song.id}/history`);
check("a save straight after a restore is its own entry", history.length === 6 && history[0].kind === "EDITED" && history[1].kind === "RESTORED");

// --- who sees it
const team = await api(owner, "POST", "/teams", { name: `History Team ${stamp}` });
sql(`insert into "TeamMembership" (id, "teamId", "userId", role, "updatedAt") values ('tmh${stamp}', '${team.id}', '${member.id}', 'MEMBER', now())`);
const teamSong = await api(owner, "POST", "/song-versions", { title: `Team history ${stamp}`, language: "en", artists: ["Band"], teamId: team.id });
await call(owner, "PATCH", `/song-versions/${teamSong.id}`, { notes: "Edited" });
history = await api(owner, "GET", `/song-versions/${teamSong.id}/history`);
r = await call(member, "GET", `/song-versions/${teamSong.id}/history`);
check("a team member sees a team song's history", r.status === 200 && r.body.length === history.length);
r = await call(member, "POST", `/song-versions/${teamSong.id}/history/${history[1].id}/restore`);
check("but can't restore it", r.status === 403, String(r.status));
r = await call(stranger, "GET", `/song-versions/${song.id}/history`);
check("someone who can't see the song can't see its history", r.status === 403 || r.status === 404, String(r.status));
r = await call(owner, "GET", `/song-versions/${teamSong.id}/history/${created.id}`);
check("an entry of another song isn't found through this one", r.status === 404, String(r.status));

// --- songs from before the history was kept
const old = await api(owner, "POST", "/song-versions", { title: `Old ${stamp}`, language: "en", artists: ["Someone"], content: chart("Old words"), contentFormat: "CHORDPRO" });
sql(`delete from "SongVersionRevision" where "songVersionId" = '${old.id}'`);
await call(owner, "PATCH", `/song-versions/${old.id}`, { content: chart("New words") });
history = await api(owner, "GET", `/song-versions/${old.id}/history`);
check("its first save keeps the song as it was first, so it can be undone", history.length === 2 && history[1].kind === "BASELINE" && history[1].author === null && history[0].changes.join() === "chart", JSON.stringify(history));
r = await call(owner, "POST", `/song-versions/${old.id}/history/${history[1].id}/restore`);
check("and undone", r.status === 200 && r.body.documentJson.sections[0].lines[0].text === "Old words");

finish();
