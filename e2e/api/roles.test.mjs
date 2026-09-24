// API-level checks for roles: ownership, permissions, items, reorder, versions, transposition.
import { stamp, sql, check, user, call, finish } from "../lib/harness.mjs";

const song = async (who, title, extra = {}) => (await call(who, "POST", "/song-versions", { artists: ["Test Artist"], title, language: "en", ...extra })).body;
const isoDate = (offsetDays) => new Date(Date.now() + offsetDays * 86400000).toISOString().slice(0, 10);


const alice = await user("alice");
const bob = await user("bob");

let r = await call(alice, "GET", "/users/me");
check("new users have no roles", r.status === 200 && Array.isArray(r.body.instruments) && r.body.instruments.length === 0 && r.body.techRoles.length === 0, JSON.stringify(r.body));

r = await call(alice, "PATCH", "/users/me", { instruments: ["DRUMS", "LEAD_VOCALS", "DRUMS"], techRoles: ["SOUND_ENGINEER", "TECHNICIAN"] });
check("set instruments and roles (deduped, list order)", r.status === 200 && r.body.instruments.join() === "LEAD_VOCALS,DRUMS" && r.body.techRoles.join() === "TECHNICIAN,SOUND_ENGINEER", JSON.stringify(r.body));

r = await call(alice, "PATCH", "/users/me", { displayName: "Alice Roles" });
check("updating something else keeps roles", r.body.instruments.join() === "LEAD_VOCALS,DRUMS" && r.body.displayName === "Alice Roles");

r = await call(alice, "PATCH", "/users/me", { instruments: ["KAZOO"] });
check("unknown instrument rejected", r.status === 400, `${r.status} ${JSON.stringify(r.body?.message)}`);
r = await call(alice, "PATCH", "/users/me", { techRoles: ["DRUMS"] });
check("instrument in techRoles rejected", r.status === 400, String(r.status));
r = await call(alice, "PATCH", "/users/me", { instruments: "DRUMS" });
check("non-array rejected", r.status === 400, String(r.status));

r = await call(alice, "PATCH", "/users/me", { techRoles: [] });
check("clearing one list leaves the other", r.body.techRoles.length === 0 && r.body.instruments.join() === "LEAD_VOCALS,DRUMS");

sql(`update "User" set instruments = array['BAGPIPES','PIANO'] where id='${alice.id}'`);
r = await call(alice, "GET", "/users/me");
check("stored values no longer on the list are dropped on read", r.body.instruments.join() === "PIANO", JSON.stringify(r.body.instruments));

r = await call(alice, "PATCH", "/users/me", { isGlobalAdmin: true, instruments: ["PIANO", "ORGAN"] });
check("unknown fields rejected (whitelist)", r.status === 400 || (r.status === 200 && r.body.isGlobalAdmin === false), `${r.status}`);

// Team members see each other's roles.
await call(alice, "PATCH", "/users/me", { instruments: ["ACOUSTIC_GUITAR"], techRoles: ["MEDIA_OPERATOR"] });
const team = (await call(alice, "POST", "/teams", { name: `Roles Team ${stamp}` })).body;
sql(`insert into "TeamMembership" (id, "teamId", "userId", role, "joinedAt", "updatedAt") values ('tmr${stamp}', '${team.id}', '${bob.id}', 'MEMBER', now(), now())`);
r = await call(bob, "GET", `/teams/${team.id}/members`);
const aliceRow = r.body.find((m) => m.userId === alice.id);
check("team members list includes roles", r.status === 200 && aliceRow.instruments.join() === "ACOUSTIC_GUITAR" && aliceRow.techRoles.join() === "MEDIA_OPERATOR" && "avatarUrl" in aliceRow, JSON.stringify(aliceRow));

finish();
