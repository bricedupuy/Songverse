// Instruments (issue #166): the built-in list's newcomers, and the odd one an
// admin adds in Admin > Instruments - anyone can pick it, it's named in their
// teams' member lists, and removing it takes it off whoever had picked it.
import { api, call, check, finish, sql, stamp, user } from "../lib/harness.mjs";

const admin = await user("Instruments admin");
sql(`update "User" set "isGlobalAdmin"=true where id='${admin.id}'`);
const player = await user("Instruments player");

let r = await call(player, "PATCH", "/users/me", { instruments: ["CAJON", "DOUBLE_BASS", "CELTIC_HARP"] });
check("the new built-in ones can be picked, shown in the list's order", r.status === 200 && r.body.instruments.join() === "CELTIC_HARP,DOUBLE_BASS,CAJON", JSON.stringify(r.body?.instruments));

r = await call(player, "POST", "/admin/instruments", { label: "Kazoo" });
check("only an admin adds one", r.status === 403, String(r.status));
r = await call(admin, "POST", "/admin/instruments", { label: "" });
check("it needs a name", r.status === 400, JSON.stringify(r.body));
r = await call(admin, "POST", "/admin/instruments", { label: `Nyckelharpa ${stamp}`, labelFr: `Nyckelharpa fr ${stamp}` });
check("an admin adds one, with its French name", r.status === 201 && r.body.label === `Nyckelharpa ${stamp}` && r.body.translations?.fr === `Nyckelharpa fr ${stamp}`, JSON.stringify(r.body));
const nyckel = r.body;
check("everyone sees it", (await api(player, "GET", "/instruments")).some((i) => i.id === nyckel.id));

r = await call(player, "PATCH", "/users/me", { instruments: [nyckel.id, "not-an-instrument"] });
check("one that isn't on the list is refused", r.status === 400 && /not-an-instrument/.test(r.body.message), JSON.stringify(r.body));
r = await call(player, "PATCH", "/users/me", { instruments: [nyckel.id, "DRUMS"] });
check("picked by its id, after the built-in ones", r.status === 200 && r.body.instruments.join() === `DRUMS,${nyckel.id}`, JSON.stringify(r.body?.instruments));

const team = await api(admin, "POST", "/teams", { name: `Instruments band ${stamp}` });
sql(`insert into "TeamMembership" (id, "teamId", "userId", role, "updatedAt") values ('tminst${stamp}', '${team.id}', '${player.id}', 'MEMBER', now())`);
const inTeam = (await api(admin, "GET", `/teams/${team.id}/members`)).find((m) => m.userId === player.id);
check("in their team's member list", inTeam?.instruments.includes(nyckel.id), JSON.stringify(inTeam));

r = await call(admin, "PATCH", `/admin/instruments/${nyckel.id}`, { labelFr: "" });
check("renamed: no French name, the English one is used", r.status === 200 && r.body.translations === null && r.body.label === `Nyckelharpa ${stamp}`, JSON.stringify(r.body));
const listed = (await api(admin, "GET", "/admin/instruments")).find((i) => i.id === nyckel.id);
check("Admin sees who plays it", listed?.userCount === 1, JSON.stringify(listed));

r = await call(admin, "DELETE", `/admin/instruments/${nyckel.id}`);
check("removed", r.status === 204, String(r.status));
check("and taken off whoever had picked it", (await api(player, "GET", "/users/me")).instruments.join() === "DRUMS" && sql(`select array_to_string(instruments, ',') from "User" where id='${player.id}'`) === "DRUMS");
r = await call(admin, "DELETE", `/admin/instruments/${nyckel.id}`);
check("an instrument that isn't there is a 404", r.status === 404, String(r.status));

await call(admin, "DELETE", `/teams/${team.id}`);
finish();
