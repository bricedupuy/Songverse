// Who sees a song's files (issue #72): each file's uploader decides - only
// them, one of their teams, or everyone who can see the song (for the
// song's editors). Anyone who sees a song adds files of their own to it.
import { API, api, call, check, finish, sql, stamp, user } from "../lib/harness.mjs";

const owner = await user("Owner");
const member = await user("Member");
const stranger = await user("Stranger");
const team = await api(owner, "POST", "/teams", { name: `Files team ${stamp}` });
sql(`insert into "TeamMembership" (id, "teamId", "userId", role, "updatedAt") values ('tmf${stamp}', '${team.id}', '${member.id}', 'MEMBER', now())`);
const otherTeam = await api(stranger, "POST", "/teams", { name: `Other team ${stamp}` });
const song = await api(owner, "POST", "/song-versions", { title: `Files ${stamp}`, language: "en", artists: ["Someone"], teamId: team.id });

const upload = async (who, name, fields = {}) => {
  const form = new FormData();
  form.append("type", "PDF");
  for (const [key, value] of Object.entries(fields)) form.append(key, value);
  form.append("file", new Blob([`%PDF-1.4 ${name} ${stamp}`], { type: "application/pdf" }), name);
  const res = await fetch(`${API}/song-versions/${song.id}/attachments`, { method: "POST", headers: { Authorization: `Bearer ${who.bearer}` }, body: form });
  return { status: res.status, body: await res.json() };
};
const names = async (who) => (await api(who, "GET", `/song-versions/${song.id}/attachments`)).map((file) => file.filename).sort().join();

// --- a new file: only its uploader sees it
let r = await upload(owner, "chart.pdf");
check("uploaded, only for its uploader by default", r.status === 201 && r.body.visibility === "PRIVATE" && r.body.canChange && r.body.canChangeVisibility, JSON.stringify(r.body));
const chart = r.body;
check("its uploader sees it", (await names(owner)) === "chart.pdf");
check("a team member doesn't", (await names(member)) === "");
r = await call(member, "GET", `/song-versions/${song.id}/attachments/${chart.id}/download`);
check("nor downloads it", r.status === 404, String(r.status));
r = await call(member, "POST", `/song-versions/${song.id}/attachments/${chart.id}/link`);
check("nor gets a link to it", r.status === 404, String(r.status));

// --- shared with the team, then with everyone who sees the song
r = await call(owner, "PATCH", `/song-versions/${song.id}/attachments/${chart.id}`, { visibility: "TEAM", teamId: team.id });
check("shown to the team", r.status === 200 && r.body.visibility === "TEAM" && r.body.visibleToTeam?.name === `Files team ${stamp}`, JSON.stringify(r.body));
const seen = (await api(member, "GET", `/song-versions/${song.id}/attachments`))[0];
check("the member sees it, can't change it or who sees it", seen?.id === chart.id && !seen.canChange && !seen.canChangeVisibility && seen.uploadedBy?.displayName === "Owner", JSON.stringify(seen));
r = await call(member, "DELETE", `/song-versions/${song.id}/attachments/${chart.id}`);
check("nor remove it", r.status === 403, String(r.status));
r = await call(owner, "PATCH", `/song-versions/${song.id}/attachments/${chart.id}`, { visibility: "TEAM" });
check("a team needs naming", r.status === 400, String(r.status));
r = await call(owner, "PATCH", `/song-versions/${song.id}/attachments/${chart.id}`, { visibility: "TEAM", teamId: otherTeam.id });
check("and must be one's own", r.status === 403, String(r.status));
r = await call(owner, "PATCH", `/song-versions/${song.id}/attachments/${chart.id}`, { visibility: "SONG" });
check("the song's editor shows it to everyone who sees the song", r.status === 200 && r.body.visibility === "SONG" && r.body.visibleToTeamId === null);

// --- a member's own files on a song they can't edit
r = await upload(member, "my-part.pdf");
check("anyone who sees the song adds their own", r.status === 201 && r.body.visibility === "PRIVATE" && r.body.canChange, JSON.stringify(r.body));
const mine = r.body;
check("the song's owner doesn't see it", (await names(owner)) === "chart.pdf");
r = await upload(member, "for-everyone.pdf", { visibility: "SONG" });
check("but only the song's editors show one to everyone", r.status === 403, String(r.status));
r = await upload(member, "for-the-band.pdf", { visibility: "TEAM", teamId: team.id });
check("a member shares one with their team", r.status === 201 && r.body.visibility === "TEAM");
const band = r.body;
const ownersView = (await api(owner, "GET", `/song-versions/${song.id}/attachments`)).find((file) => file.id === band.id);
check("the song's owner sees that, may remove it but not change who sees it", ownersView?.canChange === true && ownersView.canChangeVisibility === false, JSON.stringify(ownersView));
r = await call(owner, "PATCH", `/song-versions/${song.id}/attachments/${band.id}`, { visibility: "PRIVATE" });
check("so they can't hide it", r.status === 403, String(r.status));
r = await call(member, "PATCH", `/song-versions/${song.id}/attachments/${mine.id}`, { visibility: "SONG" });
check("nor can the member show their own to everyone", r.status === 403, String(r.status));
r = await call(member, "DELETE", `/song-versions/${song.id}/attachments/${mine.id}`);
check("the member removes their own", r.status === 204, String(r.status));
r = await upload(stranger, "sneaky.pdf");
check("someone who can't see the song adds nothing", r.status === 403 || r.status === 404, String(r.status));

// --- files from before: everyone who sees the song
sql(`insert into "Attachment" (id, "songVersionId", type, filename, "mimeType", "storageKey", "sizeBytes") select 'old${stamp}', '${song.id}', 'PDF', 'old.pdf', 'application/pdf', "storageKey", "sizeBytes" from "Attachment" where id = '${chart.id}'`);
check("a file from before is everyone's who sees the song", (await names(member)).split(",").includes("old.pdf"));
const old = (await api(owner, "GET", `/song-versions/${song.id}/attachments`)).find((file) => file.filename === "old.pdf");
check("with no uploader, the song's editors decide who sees it", old?.canChangeVisibility === true, JSON.stringify(old));

// --- offline copies follow the same rule
r = await call(member, "POST", "/offline/songs", { ids: [song.id] });
check(
  "an offline copy lists only the files its user sees",
  r.status < 300 && r.body[0]?.attachments.map((file) => file.filename).sort().join() === "chart.pdf,for-the-band.pdf,old.pdf",
  JSON.stringify(r.body?.[0]?.attachments?.map((file) => file.filename) ?? r.body),
);

finish();
