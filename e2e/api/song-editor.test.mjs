// API-level checks for song fields, required artists and full catalogue carry-over.
import { API, stamp, sql, check, user, call, finish } from "../lib/harness.mjs";

const song = async (who, title, extra = {}) => (await call(who, "POST", "/song-versions", { title, language: "en", artists: ["Test Artist"], ...extra })).body;
const isoDate = (offsetDays) => new Date(Date.now() + offsetDays * 86400000).toISOString().slice(0, 10);


const a = await user("a");
const b = await user("b");
const tagRows = sql(`select id || '|' || label from "Tag" where scope='GLOBAL' and "isApproved" limit 2`).split("\n").filter(Boolean).map((row) => row.split("|"));
check("there are global tags to use", tagRows.length === 2, JSON.stringify(tagRows));
const [tag1, tag2] = tagRows.map(([id]) => id);

// --- create with everything
let r = await call(a, "POST", "/song-versions", {
  title: `Amazing Grace ${stamp}`,
  language: "en",
  artists: ["Chris Tomlin", "Louie Giglio"],
  composers: ["John Newton", "Chris Tomlin"],
  lyricists: ["John Newton"],
  versionName: "Original",
  album: "See the Morning",
  year: 2006,
  key: "G",
  tempo: 72,
  timeSignature: "3/4",
  durationSeconds: 245,
  capo: 2,
  ccli: "4768151",
  isrc: "us-a1b-06-12345",
  notes: "Slow intro",
  tagIds: [tag1],
  content: "Verse 1\nAmazing grace how sweet the sound\nThat saved a wretch like me\n\nChorus\nMy chains are gone",
});
check("create with every field", r.status === 201, JSON.stringify(r.body).slice(0, 200));
const songId = r.body.id;
let d = (await call(a, "GET", `/song-versions/${songId}`)).body;
check("fields saved", d.versionName === "Original" && d.album === "See the Morning" && d.year === 2006 && d.isrc === "USA1B0612345" && d.notes === "Slow intro");
check("defaults saved, capo on the song", d.documentJson.$schema === "song-document/v2" && d.documentJson.defaults.key === "G" && d.capo === 2 && !("capo" in d.documentJson.defaults) && d.documentJson.defaults.timeSignature.numerator === 3 && d.documentJson.defaults.durationSeconds === 245);
check("lyrics-only content was detected and parsed", d.documentJson.sections.length === 2 && d.documentJson.sections[0].type === "verse" && d.documentJson.sections[0].lines[0].chords.length === 0 && d.documentJson.sections[0].lines[0].text === "Amazing grace how sweet the sound");
const byName = Object.fromEntries(d.contributors.map((c) => [c.source, c.roles.sort().join(",")]));
check("credits merged per person", byName["Chris Tomlin"] === "COMPOSER,PERFORMER" && byName["John Newton"] === "COMPOSER,LYRICIST" && byName["Louie Giglio"] === "PERFORMER", JSON.stringify(byName));
check("artists in order", d.artists.map((x) => x.source).join("|") === "Chris Tomlin|Louie Giglio");
check("tag saved", d.tags.length === 1 && d.tags[0].id === tag1);
check("owner can edit", d.canEdit === true);
check("list includes versionName", (await call(a, "GET", "/song-versions")).body.items.find((s) => s.id === songId)?.versionName === "Original");

r = await call(a, "POST", "/song-versions", { title: "Bad tag", language: "en", artists: ["X"], tagIds: ["nope"] });
check("unknown tag refused", r.status === 400, JSON.stringify(r.body?.message));
r = await call(a, "POST", "/song-versions", { title: "Bad capo", language: "en", artists: ["X"], capo: 12 });
check("capo over 11 refused", r.status === 400);

// --- patch credits, tags, content
r = await call(a, "PATCH", `/song-versions/${songId}`, { artists: ["Louie Giglio", "Chris Tomlin"], composers: ["John Newton"] });
d = r.body;
const byName2 = Object.fromEntries(d.contributors.map((c) => [c.source, c.roles.sort().join(",")]));
check("reordering artists", d.artists.map((x) => x.source).join("|") === "Louie Giglio|Chris Tomlin", d.artists.map((x) => x.source).join("|"));
r = await call(a, "PATCH", `/song-versions/${songId}`, { artists: ["Matt Redman", "Louie Giglio", "Chris Tomlin"], arrangers: ["New Arranger"] });
check(
  "a new artist and arranger slot in: artists first in the order given, then the rest, numbered from 0",
  r.body.contributors.map((c) => `${c.displayOrder}:${c.source}`).slice(0, 3).join("|") === "0:Matt Redman|1:Louie Giglio|2:Chris Tomlin" &&
    r.body.contributors.every((c, i) => c.displayOrder === i) &&
    r.body.contributors.some((c) => c.source === "New Arranger"),
  JSON.stringify(r.body.contributors.map((c) => [c.displayOrder, c.source])),
);
r = await call(a, "PATCH", `/song-versions/${songId}`, { artists: ["Louie Giglio", "Chris Tomlin"], arrangers: [] });
check("removing a composer role keeps the artist role", byName2["Chris Tomlin"] === "PERFORMER" && byName2["John Newton"] === "COMPOSER,LYRICIST", JSON.stringify(byName2));
r = await call(a, "PATCH", `/song-versions/${songId}`, { lyricists: [] , composers: []});
const byName3 = Object.fromEntries(r.body.contributors.map((c) => [c.source, c.roles.join(",")]));
check("clearing composers and lyricists drops a person with no role left", !("John Newton" in byName3), JSON.stringify(byName3));
r = await call(a, "PATCH", `/song-versions/${songId}`, { artists: [] });
check("clearing artists refused", r.status === 400);
r = await call(a, "PATCH", `/song-versions/${songId}`, { tagIds: [tag2] });
check("tags replaced", r.body.tags.map((t) => t.id).join() === tag2);
r = await call(a, "PATCH", `/song-versions/${songId}`, { content: "G   C\nAmazing grace", capo: 0, versionName: "" });
check("content re-parsed as chords over lyrics", r.body.documentJson.sections[0].lines[0].chords.some((c) => c.raw === "C" && c.at === 4));
check("capo 0 clears it, empty versionName clears it", r.body.capo === null && r.body.versionName === null);
r = await call(a, "PATCH", `/song-versions/${songId}`, { content: "[G]Hi", contentFormat: "RAW_TEXT" });
check("explicit format wins", r.body.documentJson.sections[0].lines[0].text === "[G]Hi");
check("key survives a content change", r.body.documentJson.defaults.key === "G");
r = await call(a, "PATCH", `/song-versions/${songId}`, { content: "" });
check("empty content clears the chart", r.body.documentJson.sections.length === 0);
r = await call(b, "PATCH", `/song-versions/${songId}`, { title: "Hijack" });
check("someone else can't edit", r.status === 403);

// --- the per-item endpoints the single save replaced are gone
for (const [method, path] of [
  ["POST", `/song-versions/${songId}/contributors`],
  ["PUT", `/song-versions/${songId}/tags/${tag1}`],
  ["POST", `/song-versions/${songId}/import`],
]) {
  r = await call(a, method, path, { source: "X", roles: ["composer"], content: "x" });
  check(`${method} ${path.replace(songId, ":id").replace(tag1, ":tagId")} is gone`, r.status === 404, String(r.status));
}

// --- credits autocomplete
r = await call(a, "GET", "/song-versions/credits?q=tom");
check("credit search finds names with roles", r.body[0]?.name === "Chris Tomlin" && r.body[0].roles.includes("PERFORMER"), JSON.stringify(r.body));
r = await call(b, "GET", "/song-versions/credits?q=giglio");
check("credit search only covers songs you can see", Array.isArray(r.body) && r.body.length === 0, JSON.stringify(r.body));
r = await call(a, "GET", "/song-versions/credits?q=");
check("empty query lists the most credited", r.body.length > 0);

// --- matches and versions
r = await call(a, "GET", `/song-versions/matches?title=${encodeURIComponent(`amazing grace ${stamp}`)}`);
check("match by title ignoring case", r.body.length === 1 && r.body[0].versions[0].id === songId && r.body[0].versions[0].artists[0] === "Louie Giglio", JSON.stringify(r.body));
r = await call(b, "GET", `/song-versions/matches?title=${encodeURIComponent(`Amazing Grace ${stamp}`)}`);
check("no matches from songs you can't see", r.body.length === 0);
r = await call(b, "POST", "/song-versions", { title: "Steal", language: "en", artists: ["X"], basedOnVersionId: songId });
check("can't base a version on a song you can't see", r.status === 403);
r = await call(a, "POST", "/song-versions", { title: `Amazing Grace ${stamp} (My Chains Are Gone)`, language: "en", artists: ["Chris Tomlin"], versionName: "Acoustic", basedOnVersionId: songId });
const acousticId = r.body.id;
check("new version joins the work", r.status === 201 && r.body.workId === d.workId);
d = (await call(a, "GET", `/song-versions/${acousticId}`)).body;
check("new version records its base", d.parentVersion?.id === songId && d.relationshipType === "ALTERNATE_VERSION" && d.versionName === "Acoustic");
r = await call(a, "GET", `/song-versions/matches?title=${encodeURIComponent(`Amazing Grace ${stamp}`)}`);
check("matches list every version of the work", r.body.length === 1 && r.body[0].versions.length === 2 && r.body[0].versions.every((v) => v.matchesTitle), JSON.stringify(r.body[0]?.versions.map((v) => [v.title, v.matchesTitle])));

// --- audio attachments
const upload = async (who, id, type, name, mime, bytes) => {
  const form = new FormData();
  form.append("type", type);
  form.append("file", new Blob([bytes], { type: mime }), name);
  const res = await fetch(`${API}/song-versions/${id}/attachments`, { method: "POST", headers: { Authorization: `Bearer ${who.bearer}` }, body: form });
  return res.status;
};
check("audio upload", (await upload(a, songId, "AUDIO", "demo.mp3", "audio/mpeg", new Uint8Array(2048))) === 201);
check("non-audio as AUDIO refused", (await upload(a, songId, "AUDIO", "demo.txt", "text/plain", new Uint8Array(10))) === 415);
check("non-audio over 25 MB refused", (await upload(a, songId, "PDF", "big.pdf", "application/pdf", new Uint8Array(26 * 1024 * 1024))) === 413);
check("OTHER type accepted", (await upload(a, songId, "OTHER", "notes.bin", "application/octet-stream", new Uint8Array(10))) === 201);

// --- set refs carry versionName
const set = (await call(a, "POST", "/setlists", { name: `Editor set ${stamp}` })).body;
await call(a, "POST", `/setlists/${set.id}/items`, { songVersionId: acousticId });
const setDetail = (await call(a, "GET", `/setlists/${set.id}`)).body;
check("set items show the version name", setDetail.items[0]?.song?.versionName === "Acoustic" && setDetail.items[0].versions.length === 2, JSON.stringify(setDetail.items?.[0]?.song));

finish();
