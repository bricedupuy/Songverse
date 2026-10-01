// Who may upload audio files (issue #183): a role's right, which people who
// sign up don't have - they can still record in Songverse - and global
// admins always have; and global admins aren't held to Admin > Storage's
// file size limits.
import { chromium } from "playwright";
import { API, ORIGIN, WEB, api, call, check, finish, signIn, sql, stamp, stepper, user } from "../lib/harness.mjs";

let page;
const step = stepper(() => page);
const newcomer = await user("Newcomer");
// As someone who's just signed up: without the role the suites' users are given.
sql(`delete from "RoleAssignment" where "userId"='${newcomer.id}'`);
const admin = await user("Upload admin");
sql(`update "User" set "isGlobalAdmin"=true where id='${admin.id}'`);
const member = await user("Member");

/** `seconds` of quiet at 8 kHz (128 kbps: kept as it is). */
function wav(seconds = 1) {
  const data = Buffer.alloc(seconds * 16000);
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write("WAVEfmt ", 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(8000, 24);
  header.writeUInt32LE(16000, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}
async function upload(who, songId, bytes, fields = {}) {
  const form = new FormData();
  form.append("type", "AUDIO");
  for (const [key, value] of Object.entries(fields)) form.append(key, value);
  form.append("file", new Blob([bytes], { type: "audio/wav" }), "Take.wav");
  const res = await fetch(`${API}/song-versions/${songId}/attachments`, { method: "POST", headers: { Authorization: `Bearer ${who.bearer}` }, body: form });
  return { status: res.status, body: await res.json().catch(() => null) };
}
const session = async (who) => (await (await fetch(`${API}/api/auth/get-session`, { headers: { cookie: who.cookie, Origin: ORIGIN } })).json()).user;

const song = await api(newcomer, "POST", "/song-versions", { title: `Mine ${stamp}`, language: "en", artists: ["Me"], content: "[G]Line\n", contentFormat: "CHORDPRO" });

// --- the right
let r = await upload(newcomer, song.id, wav());
check("someone who's just signed up can't upload an audio file", r.status === 403 && /needs a role/.test(r.body?.message), JSON.stringify(r.body));
r = await upload(newcomer, song.id, wav(), { stemPart: "VOCALS", process: "encode" });
check("but can record one in Songverse (a take it processes)", r.status === 201, JSON.stringify(r.body));
check("the session, /users/me and the upload limits say so", (await session(newcomer)).canUploadAudio === false && (await api(newcomer, "GET", "/users/me")).canUploadAudio === false && (await api(newcomer, "GET", "/uploads/limits")).canUploadAudio === false);
const roles = await api(admin, "GET", "/admin/roles");
const audio = roles.find((role) => role.builtIn === "AUDIO_UPLOADS");
check("a built-in role allows it", audio?.canUploadAudio === true && audio.name === "Audio uploads", JSON.stringify(audio));
r = await call(admin, "DELETE", `/admin/roles/${audio.id}`);
check("which can't be deleted", r.status >= 400, String(r.status));
await api(admin, "PUT", `/admin/users/${newcomer.id}/roles`, { roleIds: [audio.id] });
r = await upload(newcomer, song.id, wav());
check("given the role, they can", r.status === 201 && (await session(newcomer)).canUploadAudio === true, JSON.stringify(r.body));
check("global admins always can", (await session(admin)).canUploadAudio === true);

// --- no size limits for global admins: a file over the built-in 50 MB (the limit isn't changed: other suites read it as they run)
{
  const big = wav(3300); // 52.8 MB
  r = await upload(member, (await api(member, "POST", "/song-versions", { title: `Theirs ${stamp}`, language: "en", artists: ["Them"], content: "[G]Line\n", contentFormat: "CHORDPRO" })).id, big);
  check("someone else is held to the limit", r.status === 413, JSON.stringify(r.body));
  const adminSong = await api(admin, "POST", "/song-versions", { title: `Admin's ${stamp}`, language: "en", artists: ["Admin"], content: "[G]Line\n", contentFormat: "CHORDPRO" });
  r = await upload(admin, adminSong.id, big);
  check("a global admin isn't", r.status === 201, JSON.stringify(r.body));
  const limits = await api(admin, "GET", "/uploads/limits");
  check("their limits, the server's own", limits.limitsMb.AUDIO === 500 && limits.limitsMb.PDF === 500, JSON.stringify(limits));
}

// --- the Audio tab
const browser = await chromium.launch();
try {
  page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await signIn(page, member);
  const theirs = await api(member, "POST", "/song-versions", { title: `Tab ${stamp}`, language: "en", artists: ["Them"], content: "[G]Line\n", contentFormat: "CHORDPRO" });
  sql(`delete from "RoleAssignment" where "userId"='${member.id}'`);
  await step("without the role, the Audio tab says so instead of offering to upload", async () => {
    await page.evaluate(() => localStorage.setItem("songverse.mode", "edit"));
    await page.goto(`${WEB}/library/${theirs.id}?tab=audio`);
    await page.getByTestId("audio-uploads-off").getByText("Uploading audio files needs a role that allows it").waitFor();
    if (await page.getByTestId("audio-input").count()) throw new Error("still offered");
  });
} finally {
  await browser.close();
}
finish();
