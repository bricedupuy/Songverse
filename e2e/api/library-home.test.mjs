// The Library's home (issue #81): newly added, recently viewed, favorites
// and popular in your teams - each only what you can see, views and
// favorites your own; the favorites filter; favorites and views following
// a song folded into its catalogue song.
import { api, call, check, finish, sql, stamp, user } from "../lib/harness.mjs";

const alice = await user("Alice");
const bob = await user("Bob");
const carol = await user("Carol");
const eve = await user("Eve");
const make = (who, title, extra = {}) => api(who, "POST", "/song-versions", { title: `${title} ${stamp}`, language: "en", artists: ["Someone"], ...extra });

const team = await api(alice, "POST", "/teams", { name: `Home team ${stamp}` });
sql(`insert into "TeamMembership" (id, "teamId", "userId", role, "updatedAt") values ('tmh${stamp}', '${team.id}', '${bob.id}', 'MEMBER', now())`);
const mine = await make(alice, "Mine");
const teamA = await make(alice, "Team A", { teamId: team.id });
const teamB = await make(alice, "Team B", { teamId: team.id });
const secret = await make(eve, "Eve's");

// --- newly added: the latest you can see
let home = await api(alice, "GET", "/library/home");
check("newly added, newest first", home.newest[0]?.id === teamB.id && home.newest.some((s) => s.id === mine.id), home.newest.map((s) => s.title).join());
check("not what you can't see", !home.newest.some((s) => s.id === secret.id));
check("the rest start empty", home.recent.length === 0 && home.favorites.length === 0 && home.popular.length === 0, JSON.stringify({ r: home.recent.length, f: home.favorites.length, p: home.popular.length }));

// --- recently viewed: yours, newest first
let r = await call(alice, "POST", `/song-versions/${mine.id}/views`);
check("a view is recorded", r.status === 204, String(r.status));
await call(alice, "POST", `/song-versions/${teamA.id}/views`);
home = await api(alice, "GET", "/library/home");
check("recently viewed, last first", home.recent.map((s) => s.id).join() === [teamA.id, mine.id].join(), home.recent.map((s) => s.title).join());
await call(alice, "POST", `/song-versions/${mine.id}/views`);
home = await api(alice, "GET", "/library/home");
check("viewing again moves it first", home.recent[0]?.id === mine.id);
check("a view within the hour counts once", sql(`select count from "SongView" where "userId"='${alice.id}' and "songVersionId"='${mine.id}'`) === "1");
check("someone else's views aren't yours", (await api(bob, "GET", "/library/home")).recent.length === 0);
r = await call(alice, "POST", `/song-versions/${secret.id}/views`);
check("not a song you can't see", r.status === 403, String(r.status));

// --- favorites
r = await call(alice, "PUT", `/song-versions/${teamB.id}/favorite`);
check("starred", r.status === 204, String(r.status));
await call(alice, "PUT", `/song-versions/${teamB.id}/favorite`);
home = await api(alice, "GET", "/library/home");
check("in favorites, once", home.favorites.map((s) => s.id).join() === teamB.id);
check("the song says so", (await api(alice, "GET", `/song-versions/${teamB.id}`)).isFavorite === true && (await api(alice, "GET", `/song-versions/${mine.id}`)).isFavorite === false);
check("only hers", (await api(bob, "GET", `/song-versions/${teamB.id}`)).isFavorite === false);
const filtered = await api(alice, "GET", "/song-versions?favorites=true");
check("the favorites filter", filtered.total === 1 && filtered.items[0].id === teamB.id, JSON.stringify(filtered.items.map((s) => s.title)));
check("not a song you can't see", (await call(alice, "PUT", `/song-versions/${secret.id}/favorite`)).status === 403);
r = await call(alice, "DELETE", `/song-versions/${teamB.id}/favorite`);
check("unstarred", r.status === 204 && (await api(alice, "GET", "/library/home")).favorites.length === 0);
await call(alice, "PUT", `/song-versions/${teamB.id}/favorite`);

// --- popular in your teams: in the teams' sets, and viewed by their members
const set = await api(alice, "POST", "/setlists", { name: `Home set ${stamp}`, teamId: team.id });
await api(alice, "POST", `/setlists/${set.id}/items`, { songVersionId: teamA.id });
await call(bob, "POST", `/song-versions/${teamB.id}/views`);
await call(carol, "POST", `/song-versions/${mine.id}/views`); // not in the team
home = await api(bob, "GET", "/library/home");
check("popular: in a team set, then viewed by a member", home.popular.map((s) => s.id).join() === [teamA.id, teamB.id].join(), home.popular.map((s) => s.title).join());
check("no teams, no popular", (await api(carol, "GET", "/library/home")).popular.length === 0);
sql(`update "SongView" set "viewedAt" = now() - interval '120 days' where "userId"='${bob.id}'`);
check("only the last 90 days", !(await api(bob, "GET", "/library/home")).popular.some((s) => s.id === teamB.id));

// --- a song folded into its catalogue song keeps its favorites and views
const admin = await user("Admin");
sql(`update "User" set "isGlobalAdmin"=true where id='${admin.id}'`);
const catalogue = await make(admin, "Catalogue");
await api(admin, "POST", `/song-versions/${catalogue.id}/publish`, {});
await call(alice, "PUT", `/song-versions/${mine.id}/favorite`);
const submission = await api(alice, "POST", `/song-versions/${mine.id}/submissions`, { duplicateReason: "Ours" });
r = await call(admin, "POST", `/submissions/${submission.id}/merge`, { targetId: catalogue.id });
check("merged into the catalogue song", r.status < 300, `${r.status} ${JSON.stringify(r.body).slice(0, 200)}`);
home = await api(alice, "GET", "/library/home");
check("her favorite follows it", home.favorites.some((s) => s.id === catalogue.id) && !home.favorites.some((s) => s.id === mine.id), home.favorites.map((s) => s.title).join());
check("and her view", home.recent.some((s) => s.id === catalogue.id));

finish();
