// Who can see and change what: private songs stay private on every
// endpoint that reads them, team members see but only team admins edit,
// global admins see global drafts.
import { call, check, finish, sql, stamp, user } from "../lib/harness.mjs";

const owner = await user("owner");
const stranger = await user("stranger");
const member = await user("member");
const admin = await user("admin");
sql(`update "User" set "isGlobalAdmin"=true where id='${admin.id}'`);

const song = async (who, fields = {}) =>
  (await call(who, "POST", "/song-versions", { title: `Access ${stamp}`, language: "en", artists: ["Test Artist"], ...fields })).body;
const mine = await song(owner, { content: "[G]Private words" });

// --- a private song, from someone else's side
for (const [label, path, ok] of [
  ["the song", `/song-versions/${mine.id}`, [403]],
  ["its ChordPro export", `/song-versions/${mine.id}/chordpro`, [403]],
  ["its MusicBrainz link", `/song-versions/${mine.id}/musicbrainz`, [403]],
  ["its files", `/song-versions/${mine.id}/attachments`, [403]],
  ["its songbooks", `/song-versions/${mine.id}/songbooks`, [403]],
  ["its work", `/works/${mine.workId}`, [404]],
  ["its work's MusicBrainz link", `/works/${mine.workId}/musicbrainz`, [404]],
]) {
  const r = await call(stranger, "GET", path);
  check(`a stranger can't read ${label}`, ok.includes(r.status), `${r.status} ${JSON.stringify(r.body).slice(0, 120)}`);
}
let r = await call(owner, "GET", `/song-versions/${mine.id}/chordpro`);
check("the owner can", r.status === 200 && r.body.content.includes("Private words"));
r = await call(owner, "GET", `/works/${mine.workId}`);
check("the owner sees the work and its version", r.status === 200 && r.body.versions.length === 1);
r = await call(stranger, "GET", `/song-versions?q=${encodeURIComponent(`Access ${stamp}`)}`);
check("a stranger's library doesn't list it", r.body.total === 0);

// --- a work with a private version and a shared one only shows what you can see
const team = (await call(owner, "POST", "/teams", { name: `Access Team ${stamp}` })).body;
sql(`insert into "TeamMembership" (id, "teamId", "userId", role, "updatedAt") values ('tma${stamp}', '${team.id}', '${member.id}', 'MEMBER', now())`);
const teamVersion = await song(owner, { teamId: team.id, basedOnVersionId: mine.id, versionName: "Band" });
r = await call(member, "GET", `/works/${mine.workId}`);
check("a work lists only the versions you can see", r.status === 200 && r.body.versions.length === 1 && r.body.versions[0].id === teamVersion.id, JSON.stringify(r.body.versions?.map((v) => v.id)));

// --- team songs: members see, only admins change
r = await call(member, "GET", `/song-versions/${teamVersion.id}`);
check("a team member sees a team song, read-only", r.status === 200 && r.body.canEdit === false);
r = await call(member, "PATCH", `/song-versions/${teamVersion.id}`, { title: "Changed" });
check("a team member can't change it", r.status === 403, `${r.status} ${r.body?.message}`);
r = await call(owner, "PATCH", `/song-versions/${teamVersion.id}`, { notes: "Team admin edit" });
check("a team admin can", r.status === 200 && r.body.canEdit === true);
r = await call(stranger, "POST", "/song-versions", { title: "Sneak", language: "en", artists: ["X"], teamId: team.id });
check("only members add songs to a team", r.status === 403);

// --- private songbooks don't show through a shared song
const book = (await call(owner, "POST", "/songbooks", { name: `Private book ${stamp}`, kind: "SIMPLE" })).body;
await call(owner, "POST", `/songbooks/${book.id}/entries`, { songVersionId: teamVersion.id });
r = await call(member, "GET", `/song-versions/${teamVersion.id}/songbooks`);
check("a song doesn't reveal someone's private songbook", r.status === 200 && !r.body.some((m) => m.songbookId === book.id), JSON.stringify(r.body));
r = await call(owner, "GET", `/song-versions/${teamVersion.id}/songbooks`);
check("its owner sees it", r.body.some((m) => m.songbookId === book.id), JSON.stringify(r.body));

// --- global drafts: admins only
const draft = await song(owner, { title: `Global draft ${stamp}` });
sql(`update "SongVersion" set "ownerScope"='GLOBAL', "ownerUserId"=null, "publicationState"='DRAFT' where id='${draft.id}'`);
r = await call(stranger, "GET", `/song-versions?q=${encodeURIComponent(`Global draft ${stamp}`)}`);
check("a global draft isn't listed for others", r.body.total === 0);
r = await call(admin, "GET", `/song-versions?q=${encodeURIComponent(`Global draft ${stamp}`)}`);
check("a global admin's library lists it", r.body.total === 1);
r = await call(owner, "PATCH", `/song-versions/${draft.id}`, { title: "Nope" });
check("only global admins change global songs", r.status === 403 && /global/i.test(r.body?.message ?? ""), r.body?.message);

// --- tags: only ones you can use
const privateTag = sql(`insert into "Tag" (id, "categoryId", slug, label, scope, "ownerUserId", "isApproved", "updatedAt") select 'tag${stamp}', id, 'mine-${stamp}', 'Mine ${stamp}', 'USER', '${owner.id}', false, now() from "TagCategory" limit 1 returning id`);
r = await call(stranger, "PATCH", `/song-versions/${(await song(stranger)).id}`, { tagIds: [privateTag] });
check("someone else's private tag can't be used", r.status === 400);

finish();
