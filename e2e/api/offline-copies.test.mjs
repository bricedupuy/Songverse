// Offline copies built many at a time (issue #122): each is what the song's
// own page and files list give, and a sync carries so many at most - the
// rest come `pending`, fetched a hundred at a time with POST /offline/songs.
import { API, api, call, check, finish, stamp, user } from "../lib/harness.mjs";

const me = await user("Keeper");
const friend = await user("Friend");

// My song, with a file, a favorite of mine.
const mine = await api(me, "POST", "/song-versions", { title: `Kept ${stamp}`, language: "en", artists: ["Someone"], content: "[G]Kept\n", contentFormat: "CHORDPRO" });
const form = new FormData();
form.append("type", "TEXT");
form.append("file", new Blob(["notes"], { type: "text/plain" }), "notes.txt");
await fetch(`${API}/song-versions/${mine.id}/attachments`, { method: "POST", headers: { Authorization: `Bearer ${me.bearer}` }, body: form });
await api(me, "PUT", `/song-versions/${mine.id}/favorite`);

// A friend's song shared with me to read: not mine to manage or edit.
const theirs = await api(friend, "POST", "/song-versions", { title: `Shared ${stamp}`, language: "en", artists: ["Someone"], content: "[C]Theirs\n", contentFormat: "CHORDPRO" });
await api(friend, "POST", "/people/requests", { email: me.email });
const request = (await api(me, "GET", "/people")).incoming.find((item) => item.from.id === friend.id);
await api(me, "POST", `/people/requests/${request.id}/accept`);
await api(friend, "PUT", `/song-versions/${theirs.id}/shares/${me.id}`, { canEdit: false });

// --- a copy is the song as its page shows it, and its files as listed
let r = await call(me, "POST", "/offline/songs", { ids: [theirs.id, mine.id, "no-such-song"] });
check("copies in the order asked, one that can't be opened left out", r.status === 200 && r.body.map((copy) => copy.song.id).join() === `${theirs.id},${mine.id}`, JSON.stringify(r.body.map((copy) => copy.song.id)));
for (const [label, id] of [
  ["my song, with a file, a favorite", mine.id],
  ["a song shared with me to read", theirs.id],
]) {
  const copy = r.body.find((item) => item.song.id === id);
  const page = await api(me, "GET", `/song-versions/${id}`);
  const files = await api(me, "GET", `/song-versions/${id}/attachments`);
  const same = JSON.stringify(copy.song) === JSON.stringify(page) && JSON.stringify(copy.attachments) === JSON.stringify(files);
  check(`${label}: the copy is what its page and files list give`, same, same ? "" : JSON.stringify({ copy: copy.song, page }).slice(0, 400));
}
const copyOf = (id) => r.body.find((item) => item.song.id === id);
check(
  "rights, favorite and file as they are",
  copyOf(mine.id).song.canManage && copyOf(mine.id).song.isFavorite && copyOf(mine.id).attachments.length === 1 && !copyOf(theirs.id).song.canManage && !copyOf(theirs.id).song.canEdit && copyOf(theirs.id).song.sharedBy?.id === friend.id,
  JSON.stringify({ mine: copyOf(mine.id).song.canManage, fav: copyOf(mine.id).song.isFavorite, theirs: copyOf(theirs.id).song.sharedBy }),
);

// --- a sync carries 100 copies at most; the rest are pending
const many = await user("Big library");
for (let i = 0; i < 105; i++) {
  await api(many, "POST", "/song-versions", { title: `Many ${stamp} ${i}`, language: "en", artists: ["Someone"], content: "[G]Many\n", contentFormat: "CHORDPRO" });
}
r = await call(many, "POST", "/offline/sync", {});
const withCopy = r.body.songs.filter((song) => song.copy);
const pending = r.body.songs.filter((song) => song.pending);
check("a first sync carries 100 copies, the other 5 pending", withCopy.length === 100 && pending.length === 5 && pending.every((song) => !song.copy), `${withCopy.length} copies, ${pending.length} pending`);
const fetched = await api(many, "POST", "/offline/songs", { ids: pending.map((song) => song.id) });
check(
  "the pending ones fetched, at the versions the sync gave",
  fetched.length === 5 && fetched.every((copy) => pending.find((song) => song.id === copy.song.id)?.version === copy.version),
  JSON.stringify(fetched.map((copy) => copy.version)),
);
const known = r.body.songs.map((song) => ({ id: song.id, version: song.version }));
r = await call(many, "POST", "/offline/sync", { knownSongs: known });
check("once kept, nothing is pending or sent again", r.body.songs.length === 105 && r.body.songs.every((song) => !song.copy && !song.pending), String(r.body.songs.filter((song) => song.copy || song.pending).length));

finish();
