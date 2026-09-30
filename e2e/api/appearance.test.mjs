// Teams' and songbooks' colour and picture (issue #161): set by who manages
// them (a team's admins, a songbook's owner), a colour from the palette only;
// the picture normalised, served at its own address - only the current one
// - and removed from storage when replaced, removed or deleted with its team.
import { existsSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { API, STORAGE_DIR, api, call, check, finish, sql, stamp, user } from "../lib/harness.mjs";

const admin = await user("Looks admin");
const member = await user("Looks member");
const other = await user("Looks other");

const png = await sharp({ create: { width: 300, height: 200, channels: 3, background: { r: 200, g: 40, b: 90 } } }).png().toBuffer();
async function upload(who, owner, id, bytes = png) {
  const form = new FormData();
  form.append("file", new Blob([bytes], { type: "image/png" }), "picture.png");
  const res = await fetch(`${API}/${owner}/${id}/avatar`, { method: "PUT", headers: { Authorization: `Bearer ${who.bearer}` }, body: form });
  return { status: res.status, body: await res.json().catch(() => null) };
}
const keyOf = (url) => url.split("/").pop();

// --- A team
const team = await api(admin, "POST", "/teams", { name: `Looks band ${stamp}` });
sql(`insert into "TeamMembership" (id, "teamId", "userId", role, "updatedAt") values ('tmlook${stamp}', '${team.id}', '${member.id}', 'MEMBER', now())`);
check("a new team: no colour chosen, no picture", team.color === null && team.avatarUrl === null, JSON.stringify(team));

let r = await call(member, "PATCH", `/teams/${team.id}`, { color: "teal" });
check("a member can't change it", r.status === 403, String(r.status));
r = await call(admin, "PATCH", `/teams/${team.id}`, { color: "chartreuse" });
check("a colour from the palette only", r.status === 400, String(r.status));
r = await call(admin, "PATCH", `/teams/${team.id}`, { color: "teal" });
check("its admin picks one", r.status === 200 && r.body.color === "teal", JSON.stringify(r.body));
check("every member sees it", (await api(member, "GET", "/teams")).find((t) => t.id === team.id)?.color === "teal");

r = await upload(member, "teams", team.id);
check("a member can't set its picture", r.status === 403, String(r.status));
r = await upload(admin, "teams", team.id);
check("its admin sets one", r.status === 200 && /\/teams\/.+\/avatar\//.test(r.body.avatarUrl), JSON.stringify(r.body));
const first = r.body.avatarUrl;
let res = await fetch(first);
const served = Buffer.from(await res.arrayBuffer());
const meta = await sharp(served).metadata();
check("served to anyone, square WebP", res.status === 200 && res.headers.get("content-type") === "image/webp" && meta.width === meta.height, `${res.status} ${res.headers.get("content-type")} ${meta.width}x${meta.height}`);
check("listed with the team", (await api(member, "GET", `/teams/${team.id}`)).avatarUrl === first);

const other1 = await sharp({ create: { width: 100, height: 100, channels: 3, background: { r: 10, g: 120, b: 200 } } }).png().toBuffer();
r = await upload(admin, "teams", team.id, other1);
const second = r.body.avatarUrl;
check("replaced: the old address no longer serves", (await fetch(first)).status === 404 && (await fetch(second)).status === 200);
check("and the old picture is gone from storage", !existsSync(path.join(STORAGE_DIR, keyOf(first))));
check("a picture at another team's address isn't served", (await fetch(second.replace(team.id, "someone-else"))).status === 404);

// --- A songbook
const book = await api(other, "POST", "/songbooks", { name: `Looks book ${stamp}`, kind: "SIMPLE" });
r = await call(admin, "PATCH", `/songbooks/${book.id}`, { color: "amber" });
check("someone else's songbook can't be changed", r.status === 403 || r.status === 404, String(r.status));
r = await call(other, "PATCH", `/songbooks/${book.id}`, { color: "amber" });
check("its owner picks a colour", r.status === 200 && r.body.color === "amber", JSON.stringify(r.body));
r = await upload(other, "songbooks", book.id);
check("and a picture", r.status === 200 && (await fetch(r.body.avatarUrl)).status === 200, JSON.stringify(r.body));
const bookPicture = r.body.avatarUrl;
check("listed with it", (await api(other, "GET", "/songbooks")).find((b) => b.id === book.id)?.avatarUrl === bookPicture);
r = await call(other, "DELETE", `/songbooks/${book.id}/avatar`);
check("removed", r.status === 204 && (await fetch(bookPicture)).status === 404);
r = await call(other, "PATCH", `/songbooks/${book.id}`, { color: null });
check("back to the colour from its name", r.status === 200 && r.body.color === null, JSON.stringify(r.body));

// --- Deleted with its team
r = await call(admin, "DELETE", `/teams/${team.id}`);
check("a team deleted", r.status === 204, String(r.status));
check("its picture goes with it", !existsSync(path.join(STORAGE_DIR, keyOf(second))));
await call(other, "DELETE", `/songbooks/${book.id}`);

finish();
