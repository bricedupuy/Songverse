// A songbook's bulk upload (issue #92 moved its processing to the Worker):
// the files are matched to entries by number and queued; the Worker parses
// each ChordPro file into its song's chart and keeps the file - even for a
// song with artwork, whose address the Worker (run without
// BETTER_AUTH_SECRET, as deployed) can't sign.
import { API, api, call, check, finish, stamp, user } from "../lib/harness.mjs";
import { startFakeProviders } from "../lib/fake-providers.mjs";

const fake = await startFakeProviders();

const me = await user("Uploader");
const songbook = await api(me, "POST", "/songbooks", { name: `Hymns ${stamp}`, kind: "NUMBERED", abbreviation: "HB" });
const song = await api(me, "POST", "/song-versions", { title: `Bulk ${stamp}`, language: "en", artists: ["Uploader"] });
await api(me, "POST", `/songbooks/${songbook.id}/entries`, { songVersionId: song.id, entryCode: "7" });
let hasImage = false;
for (let i = 0; i < 60 && !hasImage; i++) {
  hasImage = !!(await api(me, "GET", `/song-versions/${song.id}`)).imageUrl;
  if (!hasImage) await new Promise((resolve) => setTimeout(resolve, 250));
}
check("the song has its artwork first", hasImage);

const preview = await api(me, "POST", `/songbooks/${songbook.id}/bulk-upload/preview`, { filenames: ["7.cho", "99.cho"] });
check("matched by number", preview.find((m) => m.filename === "7.cho")?.status === "MATCHED" && preview.find((m) => m.filename === "99.cho")?.status !== "MATCHED", JSON.stringify(preview));

const form = new FormData();
form.append("type", "CHORDPRO");
form.append("files", new Blob([`{title: Bulk ${stamp}}\n{start_of_verse}\n[G]Amazing [C]grace ${stamp}\n{end_of_verse}\n`], { type: "text/plain" }), "7.cho");
const res = await fetch(`${API}/songbooks/${songbook.id}/bulk-upload`, { method: "POST", headers: { Authorization: `Bearer ${me.bearer}` }, body: form });
const body = await res.json();
check("queued", res.status === 201, `${res.status} ${JSON.stringify(body)}`);

let chart = "";
let files = [];
for (let i = 0; i < 60; i++) {
  chart = JSON.stringify((await api(me, "GET", `/song-versions/${song.id}`)).documentJson);
  files = await api(me, "GET", `/song-versions/${song.id}/attachments`);
  if (chart.includes(`grace ${stamp}`) && files.length > 0) break;
  await new Promise((resolve) => setTimeout(resolve, 250));
}
check("the Worker parsed it into the song's chart", chart.includes(`grace ${stamp}`), chart.slice(0, 200));
check("and kept the file", files.some((f) => f.filename === "7.cho"), JSON.stringify(files.map((f) => f.filename)));
check("only its owner uploads", (await call(await user("Other"), "POST", `/songbooks/${songbook.id}/bulk-upload/preview`, { filenames: ["7.cho"] })).status === 403);

fake.close();
finish();
