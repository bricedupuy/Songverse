// Roles (issue #160): the built-in Reviewer and Stem separation roles and
// ones of our own, given to users and to teams in Admin; what someone can do
// is what any of their roles - their own or their teams' - allows, the
// largest limit winning; a team's songs count against the team's storage
// pool, not whoever uploaded to them; the session and /users/me say what
// someone can do.
import { API, ORIGIN, api, call, check, finish, sql, stamp, user } from "../lib/harness.mjs";

const admin = await user("Roles admin");
sql(`update "User" set "isGlobalAdmin"=true where id='${admin.id}'`);
const member = await user("Roles member");
const loner = await user("Roles loner");

async function upload(who, songId, bytes) {
  const form = new FormData();
  form.append("type", "PDF");
  form.append("file", new Blob([Buffer.alloc(bytes, stamp % 251)], { type: "application/pdf" }), "sheet.pdf");
  const res = await fetch(`${API}/song-versions/${songId}/attachments`, { method: "POST", headers: { Authorization: `Bearer ${who.bearer}` }, body: form });
  return { status: res.status, body: await res.json().catch(() => null) };
}
/** What BetterAuth's session says of them: the web app's and the docs' one call. */
async function session(who) {
  return (await fetch(`${API}/api/auth/get-session`, { headers: { cookie: who.cookie, Origin: ORIGIN } })).json();
}

const created = [];
const team = await api(admin, "POST", "/teams", { name: `Roles band ${stamp}` });
try {
  sql(`insert into "TeamMembership" (id, "teamId", "userId", role, "updatedAt") values ('tmrole${stamp}', '${team.id}', '${member.id}', 'MEMBER', now())`);

  // --- Admin > Roles
  let r = await call(member, "GET", "/admin/roles");
  check("only global admins manage roles", r.status === 403, String(r.status));
  let roles = await api(admin, "GET", "/admin/roles");
  const reviewer = roles.find((role) => role.builtIn === "REVIEWER");
  const stems = roles.find((role) => role.builtIn === "STEM_SEPARATION");
  check("the two built-in roles, listed first", roles[0].builtIn && roles[1].builtIn && reviewer?.canReview && stems?.canSeparateStems, JSON.stringify(roles.slice(0, 2)));
  r = await call(admin, "DELETE", `/admin/roles/${reviewer.id}`);
  check("a built-in role can't be deleted", r.status === 400, String(r.status));

  r = await call(admin, "POST", "/admin/roles", { name: `Storage 1 MB ${stamp}`, description: "Small", storageLimitMb: 1 });
  check("a storage tier created", r.status === 201 && !!r.body.id, JSON.stringify(r.body));
  const small = r.body.id;
  created.push(small);
  r = await call(admin, "POST", "/admin/roles", { name: `Storage 1 MB ${stamp}` });
  check("names are unique", r.status === 409, String(r.status));
  r = await call(admin, "POST", "/admin/roles", { name: "", storageLimitMb: -1 });
  check("a bad one refused, saying why", r.status === 400 && r.body.message.some((m) => /name/.test(m)), JSON.stringify(r.body.message));
  r = await call(admin, "POST", "/admin/roles", { name: `Storage 10 MB ${stamp}`, storageLimitMb: 10 });
  const large = r.body.id;
  created.push(large);

  // --- A user's own roles
  check("no roles, nothing more", (await api(loner, "GET", "/users/me")).isReviewer === false && (await session(loner)).user.isReviewer === false);
  r = await call(admin, "PUT", `/admin/users/${loner.id}/roles`, { roleIds: [reviewer.id, small] });
  check("roles given to a user", r.status === 204, String(r.status));
  let me = await api(loner, "GET", "/users/me");
  check("/users/me says what they can do, and which roles", me.isReviewer && !me.canSeparateStems && me.roles.includes("Reviewer") && me.roles.includes(`Storage 1 MB ${stamp}`), JSON.stringify(me.roles));
  check("so does the session (the web app and the docs)", (await session(loner)).user.isReviewer === true);
  check("they can work the review queue", (await call(loner, "GET", "/submissions")).status === 200);
  check("their tier is their limit", (await api(loner, "GET", "/users/me/storage")).limitBytes === 1024 * 1024);
  r = await call(admin, "PUT", `/admin/users/${loner.id}/roles`, { roleIds: [reviewer.id, small, large] });
  check("the largest tier wins", (await api(loner, "GET", "/users/me/storage")).limitBytes === 10 * 1024 * 1024);
  let row = (await api(admin, "GET", "/admin/users")).find((u) => u.id === loner.id);
  check("Admin > Users shows their roles and limit", row.roles.length === 3 && row.isReviewer && row.limitBytes === 10 * 1024 * 1024, JSON.stringify(row.roles));
  r = await call(admin, "PUT", `/admin/users/${loner.id}/roles`, { roleIds: ["nope"] });
  check("only existing roles", r.status === 400, String(r.status));
  await call(admin, "PUT", `/admin/users/${loner.id}/roles`, { roleIds: [] });
  check("taken away: the queue closes", (await call(loner, "GET", "/submissions")).status === 403);

  // --- A team's roles: for each member
  check("a member, before", (await api(member, "GET", "/users/me")).isReviewer === false);
  r = await call(admin, "PUT", `/admin/teams/${team.id}/roles`, { roleIds: [reviewer.id, stems.id] });
  check("roles given to a team", r.status === 204, String(r.status));
  me = await api(member, "GET", "/users/me");
  check("each member can do what they allow", me.isReviewer && me.canSeparateStems && me.roles.includes("Reviewer"), JSON.stringify(me));
  check("the queue opens for them", (await call(member, "GET", "/submissions")).status === 200);
  row = (await api(admin, "GET", "/admin/users")).find((u) => u.id === member.id);
  check("Admin > Users shows them as from the team", row.roles.length === 0 && row.teamRoles.some((role) => role.id === reviewer.id && role.teamName === team.name), JSON.stringify(row.teamRoles));

  // --- A team's storage pool: its songs count there, whoever uploaded
  await call(admin, "PUT", "/admin/storage/limits", { defaultTeamLimitMb: 1 });
  const teamSong = await api(member, "POST", "/song-versions", { title: `Pool ${stamp}`, language: "en", artists: ["Band"], teamId: team.id });
  const mine = await api(member, "POST", "/song-versions", { title: `Mine ${stamp}`, language: "en", artists: ["Band"] });
  r = await upload(member, teamSong.id, 600 * 1024);
  check("600 KB into the team's pool", r.status === 201, String(r.status));
  check("not counted against the member", (await api(member, "GET", "/users/me/storage")).usedBytes === 0);
  r = await upload(member, teamSong.id, 600 * 1024);
  check("the pool full (the teams' default, 1 MB): refused as the team's", r.status === 413 && r.body.code === "TEAM_STORAGE_LIMIT_EXCEEDED", JSON.stringify(r.body));
  r = await upload(member, mine.id, 600 * 1024);
  check("their own song still takes it", r.status === 201, String(r.status));
  await call(admin, "PUT", `/admin/teams/${team.id}/roles`, { roleIds: [reviewer.id, stems.id, large] });
  r = await upload(member, teamSong.id, 600 * 1024);
  check("a tier given to the team makes room", r.status === 201, String(r.status));
  const pool = (await api(admin, "GET", "/admin/teams")).find((t) => t.id === team.id);
  check("Admin > Teams: its members (the admin who made it too), songs, pool and roles", pool.memberCount === 2 && pool.songCount === 1 && pool.usedBytes === 1200 * 1024 && pool.limitBytes === 10 * 1024 * 1024 && pool.roles.length === 3, JSON.stringify(pool));
  const limits = await api(admin, "GET", "/admin/storage/limits");
  check("the teams' default is its own setting", limits.defaultTeamLimitMb === 1 && limits.teamIsBuiltIn === false && limits.builtInTeamDefaultMb === 50, JSON.stringify(limits));

  // --- Editing and deleting
  r = await call(admin, "PATCH", `/admin/roles/${large}`, { storageLimitMb: 20, description: "Bigger" });
  check("a role edited, taking effect at once", r.status === 204 && (await api(admin, "GET", "/admin/teams")).find((t) => t.id === team.id).limitBytes === 20 * 1024 * 1024);
  r = await call(admin, "DELETE", `/admin/roles/${large}`);
  check("a role deleted, taken from everyone", r.status === 204 && (await api(admin, "GET", "/admin/teams")).find((t) => t.id === team.id).roles.length === 2);
  created.splice(created.indexOf(large), 1);
} finally {
  await call(admin, "PUT", "/admin/storage/limits", { defaultTeamLimitMb: null });
  for (const id of created) await call(admin, "DELETE", `/admin/roles/${id}`);
  await call(admin, "DELETE", `/teams/${team.id}`);
}

finish();
