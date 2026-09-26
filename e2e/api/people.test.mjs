// People and sharing a song with a person (issue #77): asking by email
// (never telling whether it has an account), accepting, declining (which
// looks like waiting), people from your teams; sharing a song to view or
// edit, what each can do, taking it out of your library, disconnecting.
import { api, call, check, finish, sql, stamp, user } from "../lib/harness.mjs";

const alice = await user("Alice");
const bob = await user("Bob");
const carol = await user("Carol");
const dave = await user("Dave");
const eve = await user("Eve");

// --- asking, by email
let r = await call(alice, "POST", "/people/requests", { email: bob.email.toUpperCase() });
check("asked by email", r.status === 201 && r.body.connected === false, JSON.stringify(r.body));
r = await call(alice, "POST", "/people/requests", { email: `nobody-${stamp}@example.com` });
check("asking an address with no account looks the same", r.status === 201 && r.body.connected === false);
r = await call(alice, "POST", "/people/requests", { email: alice.email });
check("not yourself", r.status === 400, String(r.status));
let list = await api(alice, "GET", "/people");
check("both are waiting", list.outgoing.map((o) => o.email).sort().join() === [bob.email.toLowerCase(), `nobody-${stamp}@example.com`].sort().join(), JSON.stringify(list.outgoing));
list = await api(bob, "GET", "/people");
const fromAlice = list.incoming.find((i) => i.from.id === alice.id);
check("Bob sees Alice's request", !!fromAlice && fromAlice.from.displayName === "Alice");
r = await call(carol, "POST", `/people/requests/${fromAlice.id}/accept`);
check("nobody else can answer it", r.status === 404, String(r.status));
r = await call(bob, "POST", `/people/requests/${fromAlice.id}/accept`);
check("Bob accepts", r.status === 204, String(r.status));
check("they're each other's people", (await api(alice, "GET", "/people")).people.some((p) => p.id === bob.id) && (await api(bob, "GET", "/people")).people.some((p) => p.id === alice.id));

// --- declining looks like waiting
await call(carol, "POST", "/people/requests", { email: alice.email });
const fromCarol = (await api(alice, "GET", "/people")).incoming.find((i) => i.from.id === carol.id);
await call(alice, "POST", `/people/requests/${fromCarol.id}/decline`);
check("declined: gone for Alice", !(await api(alice, "GET", "/people")).incoming.some((i) => i.from.id === carol.id));
check("still waiting for Carol", (await api(carol, "GET", "/people")).outgoing.some((o) => o.email === alice.email.toLowerCase()));
await call(carol, "POST", "/people/requests", { email: alice.email });
check("asking again doesn't bring it back", !(await api(alice, "GET", "/people")).incoming.some((i) => i.from.id === carol.id));

// --- people from your teams; asking each other connects
const team = await api(alice, "POST", "/teams", { name: `People team ${stamp}` });
sql(`insert into "TeamMembership" (id, "teamId", "userId", role, "updatedAt") values ('tmp${stamp}', '${team.id}', '${dave.id}', 'MEMBER', now())`);
check("someone from her team is suggested", (await api(alice, "GET", "/people")).suggestions.some((s) => s.id === dave.id));
r = await call(alice, "POST", "/people/requests", { userId: eve.id });
check("only someone from your teams by id", r.status === 404, String(r.status));
await call(alice, "POST", "/people/requests", { userId: dave.id });
r = await call(dave, "POST", "/people/requests", { email: alice.email });
check("asking someone who asked you connects you", r.body.connected === true && (await api(alice, "GET", "/people")).people.some((p) => p.id === dave.id));

// --- sharing a song
const song = await api(alice, "POST", "/song-versions", { title: `Shared ${stamp}`, language: "en", artists: ["Alice"], content: "{start_of_verse}\n[G]Line\n{end_of_verse}\n" });
r = await call(alice, "PUT", `/song-versions/${song.id}/shares/${carol.id}`, { canEdit: false });
check("only with one of your people", r.status === 403, String(r.status));
r = await call(bob, "PUT", `/song-versions/${song.id}/shares/${bob.id}`, { canEdit: true });
check("only who manages the song shares it", r.status === 403, String(r.status));
r = await call(alice, "PUT", `/song-versions/${song.id}/shares/${bob.id}`, { canEdit: false });
check("shared with Bob, to view", r.status === 200 && r.body.length === 1 && r.body[0].user.id === bob.id && r.body[0].canEdit === false, JSON.stringify(r.body));
const inLibrary = (await api(bob, "GET", `/song-versions?q=${encodeURIComponent(`Shared ${stamp}`)}`)).items[0];
check("in Bob's library, shared by Alice", inLibrary?.id === song.id && inLibrary.sharedBy?.displayName === "Alice", JSON.stringify(inLibrary?.sharedBy));
let detail = await api(bob, "GET", `/song-versions/${song.id}`);
check("to view: can't change it", detail.canEdit === false && detail.canManage === false && detail.sharedBy?.id === alice.id);
check("but can add a version of his own", (await call(bob, "POST", `/song-versions/${song.id}/arrangements`, { name: "Bob's" })).status === 201);
r = await call(bob, "PATCH", `/song-versions/${song.id}`, { title: "Bob's now" });
check("a viewer can't edit", r.status === 403, String(r.status));
check("Carol doesn't see it", (await call(carol, "GET", `/song-versions/${song.id}`)).status === 403);

await api(alice, "PUT", `/song-versions/${song.id}/shares/${bob.id}`, { canEdit: true });
detail = await api(bob, "GET", `/song-versions/${song.id}`);
check("to edit: changes its content, doesn't manage it", detail.canEdit === true && detail.canManage === false);
r = await call(bob, "PATCH", `/song-versions/${song.id}`, { title: `Shared ${stamp} (edited)`, revision: detail.documentJson.revision });
check("an editor saves it", r.status === 200, String(r.status));
check("in its history, under his name", (await api(alice, "GET", `/song-versions/${song.id}/history`))[0].author?.id === bob.id);
r = await call(bob, "DELETE", `/song-versions/${song.id}`);
check("but can't delete it", r.status === 403, String(r.status));
r = await call(bob, "GET", `/song-versions/${song.id}/shares`);
check("nor see who it's shared with", r.status === 403, String(r.status));
r = await call(bob, "PUT", `/song-versions/${song.id}/shares/${dave.id}`, { canEdit: false });
check("nor share it further", r.status === 403, String(r.status));
r = await call(bob, "POST", `/song-versions/${song.id}/submissions`, {});
check("nor publish it", r.status === 403, String(r.status));
const set = await api(bob, "POST", "/setlists", { name: `Bob's set ${stamp}` });
r = await call(bob, "POST", `/setlists/${set.id}/items`, { songVersionId: song.id });
check("he can put it in his sets", r.status === 201, String(r.status));

// --- taking it out, disconnecting
r = await call(bob, "DELETE", `/song-versions/${song.id}/shares/me`);
check("Bob takes it out of his library", r.status === 204 && (await call(bob, "GET", `/song-versions/${song.id}`)).status === 403);
await api(alice, "PUT", `/song-versions/${song.id}/shares/${bob.id}`, { canEdit: false });
r = await call(alice, "DELETE", `/people/${bob.id}`);
check("Alice removes Bob from her people", r.status === 204, String(r.status));
check("what she'd shared with him isn't any more", (await call(bob, "GET", `/song-versions/${song.id}`)).status === 403);
check("nor is he one of her people", !(await api(alice, "GET", "/people")).people.some((p) => p.id === bob.id));

finish();
