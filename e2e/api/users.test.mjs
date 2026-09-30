// API-level smoke test for user management: ban, storage limit, delete+transfer+claim, delete content.
import { readFileSync } from "node:fs";
import { WEB, API, ORIGIN, LOG, stamp, tag, results, sql, user, finish } from "../lib/harness.mjs";


function check(name, ok, detail = "") {
  results.push(ok);
  console.log(`${ok ? "OK  " : "FAIL"} ${name}${detail ? ` -> ${detail}` : ""}`);
}

async function signUpVerified(tag) {
  const email = `um-${tag}-${stamp}@example.com`;
  const offset = readFileSync(LOG, "utf8").length;
  await fetch(`${API}/api/auth/sign-up/email`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: ORIGIN },
    body: JSON.stringify({ email, password: "hunter2pass", name: `UM ${tag}` }),
  });
  let link;
  for (let i = 0; i < 30 && !link; i++) {
    await new Promise((r) => setTimeout(r, 300));
    link = readFileSync(LOG, "utf8").slice(offset).match(/https?:\/\/[^\s]+?\/api\/auth\/verify-email\?token=[^\s&]+/)?.[0];
  }
  await fetch(link, { redirect: "manual" });
  return { email, id: sql(`select id from "User" where email='${email}'`) };
}

async function signIn(email) {
  const res = await fetch(`${API}/api/auth/sign-in/email`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: ORIGIN },
    body: JSON.stringify({ email, password: "hunter2pass" }),
  });
  const cookie = res.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
  if (!res.ok) return { status: res.status, body: await res.json().catch(() => null) };
  const tokenRes = await fetch(`${API}/api/auth/token`, { headers: { cookie, Origin: ORIGIN } });
  return { status: res.status, cookie, bearer: (await tokenRes.json()).token };
}

const call = (bearer, method, path, body) =>
  fetch(`${API}${path}`, {
    method,
    headers: { Authorization: `Bearer ${bearer}`, ...(body && !(body instanceof FormData) && { "Content-Type": "application/json" }) },
    body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
  });

async function upload(bearer, songId, bytes) {
  const form = new FormData();
  form.append("type", "PDF");
  form.append("file", new Blob([Buffer.alloc(bytes, stamp % 251)], { type: "application/pdf" }), "sheet.pdf");
  return call(bearer, "POST", `/song-versions/${songId}/attachments`, form);
}

// --- setup
const admin = await signUpVerified("admin");
sql(`update "User" set "isGlobalAdmin"=true where id='${admin.id}'`);
const owner = await signUpVerified("owner");
const claimant = await signUpVerified("claimant");
const adminS = await signIn(admin.email);
let ownerS = await signIn(owner.email);
const claimantS = await signIn(claimant.email);

const song = await (await call(ownerS.bearer, "POST", "/song-versions", { artists: ["Test Artist"], title: `UM Song ${stamp}`, language: "en" })).json();
check("owner creates a song", !!song.id, song.id ?? JSON.stringify(song));

// --- storage limit
// A storage tier (issue #160): a role with a limit.
const tier = await (await call(adminS.bearer, "POST", "/admin/roles", { name: `Storage 1 MB ${stamp}`, storageLimitMb: 1 })).json();
let res = await call(adminS.bearer, "PUT", `/admin/users/${owner.id}/roles`, { roleIds: [tier.id] });
check("admin gives a 1 MB storage tier", res.status === 204, String(res.status));
res = await upload(ownerS.bearer, song.id, 600 * 1024);
check("600 KB upload fits", res.status === 201, String(res.status));
res = await upload(ownerS.bearer, song.id, 600 * 1024 + 1);
const over = await res.json();
check("second 600 KB upload rejected with 413", res.status === 413 && over.code === "STORAGE_LIMIT_EXCEEDED", `${res.status} ${over.message}`);
check("upload attributed to uploader", sql(`select count(*) from "Attachment" where "uploadedByUserId"='${owner.id}'`) === "1");

let users = await (await call(adminS.bearer, "GET", "/admin/users")).json();
let row = users.find((u) => u.id === owner.id);
check("admin list shows usage/limit/verified", row?.usedBytes === 600 * 1024 && row?.limitBytes === 1024 * 1024 && row?.emailVerified === true, JSON.stringify({ used: row?.usedBytes, limit: row?.limitBytes }));
check("admin is unlimited", users.find((u) => u.id === admin.id)?.limitBytes === null);

res = await call(adminS.bearer, "PUT", "/admin/storage/limits", { defaultLimitMb: 75 });
const limits = await (await call(adminS.bearer, "GET", "/admin/storage/limits")).json();
check("default limit saved", res.status === 204 && limits.defaultLimitMb === 75 && limits.isBuiltIn === false, JSON.stringify(limits));
await call(adminS.bearer, "PUT", "/admin/storage/limits", { defaultLimitMb: null });
await call(adminS.bearer, "DELETE", `/admin/roles/${tier.id}`);

// --- ban
res = await call(adminS.bearer, "PATCH", `/admin/users/${owner.id}`, { banned: true, banReason: "spam" });
check("admin bans owner", res.status === 204, String(res.status));
res = await call(ownerS.bearer, "GET", "/users/me");
check("existing token rejected after ban", res.status === 401, String(res.status));
const bannedSignIn = await signIn(owner.email);
check("banned sign-in refused with reason", bannedSignIn.status === 403 && bannedSignIn.body?.message?.includes("spam"), `${bannedSignIn.status} ${bannedSignIn.body?.message}`);
res = await call(adminS.bearer, "PATCH", `/admin/users/${admin.id}`, { banned: true });
check("admin can't ban self", res.status === 403, String(res.status));
await call(adminS.bearer, "PATCH", `/admin/users/${owner.id}`, { banned: false });
ownerS = await signIn(owner.email);
check("unbanned user signs in again", ownerS.status === 200, String(ownerS.status));

// --- delete keeping content for transfer
res = await call(adminS.bearer, "POST", `/admin/users/${owner.id}/delete`, { contentAction: "transfer", retentionDays: 7 });
const transfer = await res.json();
check("delete-with-transfer returns link", res.status === 201 && transfer.transferUrl?.startsWith(`${WEB}/transfer/`), `${res.status} ${transfer.transferUrl}`);
const token = transfer.transferUrl.split("/").pop();
check("deleted user signed out", (await call(ownerS.bearer, "GET", "/users/me")).status === 401);
check("deleted user can't sign in", (await signIn(owner.email)).status !== 200);
check("email freed", sql(`select count(*) from "User" where email='${owner.email}'`) === "0");
check("token stored hashed", sql(`select count(*) from "ContentTransfer" where "tokenHash"='${token}'`) === "0");

const preview = await (await call(claimantS.bearer, "GET", `/transfers/${token}`)).json();
check("claimant sees preview", preview.songCount === 1 && preview.storageBytes === 600 * 1024, JSON.stringify(preview));
res = await call(claimantS.bearer, "POST", `/transfers/${token}/claim`);
check("claim succeeds", res.status === 204, String(res.status));
check("song now owned by claimant", sql(`select "ownerUserId" from "SongVersion" where id='${song.id}'`) === claimant.id);
check("storage now charged to claimant", sql(`select count(*) from "Attachment" where "uploadedByUserId"='${claimant.id}'`) === "1");
check("old account gone", sql(`select count(*) from "User" where id='${owner.id}'`) === "0");
res = await call(claimantS.bearer, "POST", `/transfers/${token}/claim`);
check("link is single-use", res.status === 404, String(res.status));

// --- delete with content
const victim = await signUpVerified("victim");
const victimS = await signIn(victim.email);
const vSong = await (await call(victimS.bearer, "POST", "/song-versions", { artists: ["Test Artist"], title: `UM Victim ${stamp}`, language: "en" })).json();
await upload(victimS.bearer, vSong.id, 1234);
const vKey = sql(`select "storageKey" from "Attachment" where "songVersionId"='${vSong.id}'`);
res = await call(adminS.bearer, "POST", `/admin/users/${victim.id}/delete`, { contentAction: "delete" });
check("delete-with-content succeeds", res.status === 201, String(res.status));
check("their song is gone", sql(`select count(*) from "SongVersion" where id='${vSong.id}'`) === "0");
check("their account is gone", sql(`select count(*) from "User" where id='${victim.id}'`) === "0");
check("unreferenced file removed from storage", sql(`select count(*) from "Attachment" where "storageKey"='${vKey}'`) === "0");
res = await call(adminS.bearer, "POST", `/admin/users/${admin.id}/delete`, { contentAction: "delete" });
check("admin can't delete self", res.status === 403, String(res.status));

// --- expiry
const expiring = await signUpVerified("expiring");
const eS = await signIn(expiring.email);
const eSong = await (await call(eS.bearer, "POST", "/song-versions", { artists: ["Test Artist"], title: `UM Expiring ${stamp}`, language: "en" })).json();
await call(adminS.bearer, "POST", `/admin/users/${expiring.id}/delete`, { contentAction: "transfer", retentionDays: 1 });
sql(`update "ContentTransfer" set "expiresAt"=now() - interval '1 minute' where "fromUserId"='${expiring.id}'`);
console.log(JSON.stringify({ expiringUserId: expiring.id, expiringSongId: eSong.id }));

finish();
