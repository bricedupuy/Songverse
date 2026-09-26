// People follow-ups (issue #79): a file for the people a song is shared
// with (SHARED), who sees it and who may choose it; the email a request to
// connect sends - the same with or without an account - and its daily limit.
import { readFileSync } from "node:fs";
import { API, LOG, api, call, check, finish, logOffset, sql, stamp, user, waitForLog } from "../lib/harness.mjs";

const alice = await user("Alice");
const bob = await user("Bob");
const carol = await user("Carol");
const connect = async (from, to) => {
  await api(from, "POST", "/people/requests", { email: to.email });
  const request = (await api(to, "GET", "/people")).incoming.find((i) => i.from.id === from.id);
  await api(to, "POST", `/people/requests/${request.id}/accept`);
};
await connect(alice, bob);
await connect(alice, carol);

const song = await api(alice, "POST", "/song-versions", { title: `Shared files ${stamp}`, language: "en", artists: ["Alice"] });
const upload = async (who, name, fields = {}) => {
  const form = new FormData();
  form.append("type", "PDF");
  for (const [key, value] of Object.entries(fields)) form.append(key, value);
  form.append("file", new Blob([`%PDF-1.4 ${name} ${stamp}`], { type: "application/pdf" }), name);
  const res = await fetch(`${API}/song-versions/${song.id}/attachments`, { method: "POST", headers: { Authorization: `Bearer ${who.bearer}` }, body: form });
  return { status: res.status, body: await res.json() };
};
const names = async (who) => (await api(who, "GET", `/song-versions/${song.id}/attachments`)).map((file) => file.filename).sort().join();

// --- a file for the people the song is shared with
await api(alice, "PUT", `/song-versions/${song.id}/shares/${bob.id}`, { canEdit: false });
let r = await upload(alice, "for-bob.pdf", { visibility: "SHARED" });
check("Alice shows a file to the people she shares the song with", r.status === 201 && r.body.visibility === "SHARED", JSON.stringify(r.body));
const file = r.body;
await upload(alice, "mine.pdf");
check("Bob, whom it's shared with, sees it (not her own one)", (await names(bob)) === "for-bob.pdf");
const seen = (await api(bob, "GET", `/song-versions/${song.id}/attachments`))[0];
check("but can't change who sees it", !seen.canChangeVisibility && seen.uploadedBy?.displayName === "Alice");
const download = await fetch(`${API}/song-versions/${song.id}/attachments/${file.id}/download`, { headers: { Authorization: `Bearer ${bob.bearer}` } });
check("and downloads it", download.status === 200, String(download.status));
r = await upload(bob, "bobs.pdf", { visibility: "SHARED" });
check("Bob can't show his own file to them: he doesn't share the song", r.status === 403, String(r.status));
check("Carol, not shared with, sees nothing", (await call(carol, "GET", `/song-versions/${song.id}/attachments`)).status === 403);

await api(alice, "PUT", `/song-versions/${song.id}/shares/${carol.id}`, { canEdit: true });
check("sharing the song with Carol shows her the file too", (await names(carol)) === "for-bob.pdf");
await api(alice, "DELETE", `/song-versions/${song.id}/shares/${bob.id}`);
check("no longer shared with Bob: he doesn't see it", (await call(bob, "GET", `/song-versions/${song.id}/attachments`)).status === 403);
r = await call(alice, "PATCH", `/song-versions/${song.id}/attachments/${file.id}`, { visibility: "PRIVATE" });
check("back to only her", r.status === 200 && (await names(carol)) === "");

// --- a catalogue song isn't shared with anyone
const global = sql(`select id from "SongVersion" where "ownerScope" = 'GLOBAL' limit 1`);
const admin = await user("Admin");
sql(`update "User" set "isGlobalAdmin" = true where id = '${admin.id}'`);
const form = new FormData();
form.append("type", "PDF");
form.append("visibility", "SHARED");
form.append("file", new Blob([`%PDF-1.4 g ${stamp}`], { type: "application/pdf" }), "g.pdf");
const res = await fetch(`${API}/song-versions/${global}/attachments`, { method: "POST", headers: { Authorization: `Bearer ${admin.bearer}` }, body: form });
check("not for a catalogue song", !global || res.status === 400, String(res.status));

// --- publishing: sharing ends, so the file goes back to its uploader only
await api(alice, "PUT", `/song-versions/${song.id}/shares/${bob.id}`, { canEdit: false });
const before = (await upload(alice, "shared-before.pdf", { visibility: "SHARED" })).body;
const submission = await api(alice, "POST", `/song-versions/${song.id}/submissions`, {});
await call(admin, "POST", `/submissions/${submission.id}/start-review`);
r = await call(admin, "POST", `/submissions/${submission.id}/approve`, {});
check("published", r.status < 300, `${r.status} ${JSON.stringify(r.body)}`);
const after = (await api(alice, "GET", `/song-versions/${song.id}/attachments`)).find((f) => f.id === before.id);
check("the file is only hers now", after?.visibility === "PRIVATE", JSON.stringify(after));
check("Bob doesn't see it", !(await api(bob, "GET", `/song-versions/${song.id}/attachments`)).some((f) => f.id === before.id));

// --- the email a request to connect sends
let offset = logOffset();
const dave = await user("Dave");
await api(alice, "POST", "/people/requests", { email: dave.email });
let [mail] = await waitForLog(offset, new RegExp(`To: ${dave.email.toLowerCase().replace(/[.+]/g, "\\$&")}\\nSubject: Alice would like to share songs with you on Songverse[\\s\\S]*?/people`));
check("an email to someone with an account", !!mail);
const stranger = `nobody-${stamp}@example.com`;
offset = logOffset();
await api(alice, "POST", "/people/requests", { email: stranger });
[mail] = await waitForLog(offset, new RegExp(`To: ${stranger.replace(/[.+]/g, "\\$&")}\\nSubject: Alice would like to share songs with you on Songverse`));
check("the same to an address with none: an invitation", !!mail);
offset = logOffset();
await api(alice, "POST", "/people/requests", { email: stranger });
await new Promise((resolve) => setTimeout(resolve, 1500));
check("asking again sends no second email", !readFileSync(LOG, "utf8").slice(offset).includes(`To: ${stranger}`));

// Signing up with that address finds the request waiting.
sql(`update "User" set email = '${stranger}' where id = '${dave.id}'`);
sql(`delete from "Connection" where "requesterId" = '${alice.id}' and "addresseeEmail" = '${dave.email.toLowerCase()}'`);
check("whoever signs up with it finds the request", (await api(dave, "GET", "/people")).incoming.some((i) => i.from.id === alice.id));

// --- a limit per day
const eve = await user("Eve");
const sent = [];
for (let i = 0; i < 21; i++) sent.push((await call(eve, "POST", "/people/requests", { email: `limit-${i}-${stamp}@example.com` })).status);
check("up to 20 people a day", sent.slice(0, 20).every((s) => s === 201) && sent[20] === 429, sent.join());
r = await call(eve, "POST", "/people/requests", { email: `limit-0-${stamp}@example.com` });
check("asking one of them again still answers", r.status === 201, String(r.status));

finish();
