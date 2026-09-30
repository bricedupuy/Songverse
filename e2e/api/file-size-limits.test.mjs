// The largest song file of each type (issue #163): set in Admin > Storage,
// checked by the API on every upload (the file's type's own limit, whatever
// the others), readable by the app to check a file before sending it;
// reset to the built-in one.
import { API, api, call, check, finish, sql, stamp, user } from "../lib/harness.mjs";

const admin = await user("Sizes admin");
sql(`update "User" set "isGlobalAdmin"=true where id='${admin.id}'`);
const singer = await user("Sizes singer");

async function upload(who, songId, type, bytes, name, mime) {
  const form = new FormData();
  form.append("type", type);
  form.append("file", new Blob([Buffer.alloc(bytes, 7)], { type: mime }), name);
  const res = await fetch(`${API}/song-versions/${songId}/attachments`, { method: "POST", headers: { Authorization: `Bearer ${who.bearer}` }, body: form });
  return { status: res.status, body: await res.json().catch(() => null) };
}
const MB = 1024 * 1024;

try {
  let limits = await api(singer, "GET", "/uploads/limits");
  check("anyone signed in reads the limits: the built-in ones", limits.limitsMb.PDF === 25 && limits.limitsMb.AUDIO === 50, JSON.stringify(limits));

  let r = await call(singer, "PUT", "/admin/storage/file-size-limits", { limitsMb: { PDF: 1 } });
  check("only global admins set them", r.status === 403, String(r.status));
  r = await call(admin, "PUT", "/admin/storage/file-size-limits", { limitsMb: { PDF: 501 } });
  check("not above 500 MB, saying why", r.status === 400 && r.body.message.some((m) => /500 MB/.test(m)), JSON.stringify(r.body));
  r = await call(admin, "PUT", "/admin/storage/file-size-limits", { limitsMb: { SHEET: 3 } });
  check("only the file types", r.status === 400, String(r.status));
  r = await call(admin, "PUT", "/admin/storage/file-size-limits", { limitsMb: { PDF: 1, TEXT: 2 } });
  check("saved", r.status === 204, String(r.status));
  const admins = await api(admin, "GET", "/admin/storage/file-size-limits");
  check("Admin > Storage: each type's, which are saved, and the built-in ones", admins.limitsMb.PDF === 1 && admins.limitsMb.AUDIO === 50 && admins.custom.join() === "PDF,TEXT" && admins.builtInMb.PDF === 25, JSON.stringify(admins));
  limits = await api(singer, "GET", "/uploads/limits");
  check("and the app sees them", limits.limitsMb.PDF === 1 && limits.limitsMb.TEXT === 2);

  const song = await api(singer, "POST", "/song-versions", { title: `Sizes ${stamp}`, language: "en", artists: ["Band"] });
  r = await upload(singer, song.id, "PDF", 1.5 * MB, "Big.pdf", "application/pdf");
  check("a PDF over its limit refused, naming the limit", r.status === 413 && /PDF files can be up to 1 MB/.test(r.body.message), JSON.stringify(r.body));
  r = await upload(singer, song.id, "PDF", 0.5 * MB, "Small.pdf", "application/pdf");
  check("one within it taken", r.status === 201, String(r.status));
  r = await upload(singer, song.id, "OTHER", 1.5 * MB, "Big.bin", "application/octet-stream");
  check("another type keeps its own limit", r.status === 201, String(r.status));

  await call(admin, "PUT", "/admin/storage/file-size-limits", { limitsMb: { OTHER: 1 } });
  r = await upload(singer, song.id, "OTHER", 51 * MB, "Huge.bin", "application/octet-stream");
  check("a file larger than every limit (audio's 50 MB) is cut off as it arrives", r.status === 413 && /up to 50 MB/.test(r.body?.message), `${r.status} ${JSON.stringify(r.body)}`);

  r = await call(admin, "PUT", "/admin/storage/file-size-limits", { limitsMb: { PDF: null } });
  check("reset to the built-in one, the others kept", r.status === 204 && (await api(singer, "GET", "/uploads/limits")).limitsMb.PDF === 25 && (await api(singer, "GET", "/uploads/limits")).limitsMb.TEXT === 2);
} finally {
  await call(admin, "PUT", "/admin/storage/file-size-limits", { limitsMb: { PDF: null, TEXT: null, OTHER: null } });
}

finish();
