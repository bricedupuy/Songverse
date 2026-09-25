// The stem player (issue #64): audio files marked as parts of the song -
// by their names on upload, or by hand - played together in Practice, each
// part with its own mute and solo. MP3 and Opus files (e2e/fixtures/stems).
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { API, WEB, api, call, check, finish, signIn, stamp, stepper, user } from "../lib/harness.mjs";

const FIXTURES = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../fixtures/stems");
const fixture = (name) => path.join(FIXTURES, name);

let page;
const step = stepper(() => page);
const me = await user("Drummer");
const stranger = await user("Stranger");
const song = (title) => api(me, "POST", "/song-versions", { title, language: "en", artists: [`Band ${stamp}`], content: "[G]Hello [C]world\n", contentFormat: "CHORDPRO" });
const upload = async (songId, name, type, fields = {}, mime = "application/octet-stream") => {
  const form = new FormData();
  form.append("type", type);
  for (const [key, value] of Object.entries(fields)) form.append(key, value);
  form.append("file", new Blob([readFileSync(fixture(name))], { type: mime }), name);
  const res = await fetch(`${API}/song-versions/${songId}/attachments`, { method: "POST", headers: { Authorization: `Bearer ${me.bearer}` }, body: form });
  return { status: res.status, body: await res.json().catch(() => null) };
};

// --- the API
const apiSong = await song(`Stems API ${stamp}`);
let r = await upload(apiSong.id, "Morning Light - Vocals.opus", "AUDIO", { stemPart: "VOCALS" });
check("an .opus file with no audio type is recognised by its bytes, as a stem", r.status === 201 && r.body.mimeType === "audio/ogg" && r.body.stemPart === "VOCALS", JSON.stringify(r.body));
const vocals = r.body;
r = await upload(apiSong.id, "03 drums.mp3", "AUDIO", {}, "audio/mpeg");
check("without a part it's a plain recording", r.status === 201 && r.body.stemPart === null);
const drums = r.body;
r = await upload(apiSong.id, "03 drums.mp3", "AUDIO", { stemPart: "TRIANGLE" }, "audio/mpeg");
check("an unknown part is refused", r.status === 400, String(r.status));
r = await upload(apiSong.id, "03 drums.mp3", "OTHER", { stemPart: "DRUMS" });
check("only audio can be a stem", r.status === 400, String(r.status));
const other = (await upload(apiSong.id, "03 drums.mp3", "OTHER")).body;

const version = async () => (await api(me, "POST", "/offline/sync", {})).songs.find((s) => s.id === apiSong.id)?.version;
const before = await version();
r = await call(me, "PATCH", `/song-versions/${apiSong.id}/attachments/${drums.id}`, { stemPart: "DRUMS" });
check("a file's part can be set", r.status === 200 && r.body.stemPart === "DRUMS", JSON.stringify(r.body));
check("which changes the song's offline version", (await version()) !== before);
r = await call(me, "PATCH", `/song-versions/${apiSong.id}/attachments/${vocals.id}`, { stemPart: null });
check("and cleared", r.status === 200 && r.body.stemPart === null);
r = await call(me, "PATCH", `/song-versions/${apiSong.id}/attachments/${vocals.id}`, { stemPart: "KAZOO" });
check("an unknown part is refused", r.status === 400, String(r.status));
r = await call(me, "PATCH", `/song-versions/${apiSong.id}/attachments/${other.id}`, { stemPart: "BASS" });
check("a file that isn't audio can't be a stem", r.status === 400, String(r.status));
r = await call(stranger, "PATCH", `/song-versions/${apiSong.id}/attachments/${drums.id}`, { stemPart: "BASS" });
check("someone else can't change it", r.status === 403 || r.status === 404, String(r.status));
r = await call(me, "GET", `/song-versions/${apiSong.id}/attachments`);
check("the list gives each file's part", r.body.find((a) => a.id === drums.id)?.stemPart === "DRUMS" && r.body.find((a) => a.id === other.id)?.stemPart === null);

// --- the web app
const webSong = await song(`Stems ${stamp}`);
const set = await api(me, "POST", "/setlists", { name: `Stem set ${stamp}` });
const [item] = (await api(me, "POST", `/setlists/${set.id}/items`, { songVersionId: webSong.id })).items;

const browser = await chromium.launch();
page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
await signIn(page, me);
const partOf = (name) => page.getByLabel(`Stem for ${name}`);
const player = () => page.getByTestId("stem-player");
const track = (part) => player().locator(`[data-testid="stem-track"][data-part="${part}"]`);

await step("uploading stems: named parts are recognised, MP3 and Opus", async () => {
  await page.goto(`${WEB}/library/${webSong.id}?tab=audio`);
  await page.waitForLoadState("networkidle");
  await page.getByTestId("audio-input").setInputFiles(["Morning Light - Vocals.opus", "Morning Light - Bass.mp3", "03 drums.mp3", "track4.opus"].map(fixture));
  await page.getByTestId("audio-list").locator("li").nth(3).waitFor();
  const parts = {};
  for (const name of ["Morning Light - Vocals.opus", "Morning Light - Bass.mp3", "03 drums.mp3", "track4.opus"]) parts[name] = await partOf(name).inputValue();
  if (JSON.stringify(parts) !== JSON.stringify({ "Morning Light - Vocals.opus": "VOCALS", "Morning Light - Bass.mp3": "BASS", "03 drums.mp3": "DRUMS", "track4.opus": "" })) {
    throw new Error(JSON.stringify(parts));
  }
});

await step("a file the name doesn't tell is assigned by hand", async () => {
  await partOf("track4.opus").selectOption({ label: "Piano and keys" });
  await page.waitForLoadState("networkidle");
  for (let i = 0; i < 25 && (await api(me, "GET", `/song-versions/${webSong.id}/attachments`)).find((a) => a.filename === "track4.opus")?.stemPart !== "KEYS"; i++) await page.waitForTimeout(200);
  if ((await partOf("track4.opus").inputValue()) !== "KEYS") throw new Error("not saved");
});

await step("in Edit there's no player, just the way to Practice", async () => {
  if (await player().count()) throw new Error("a player in Edit");
  await page.getByRole("button", { name: "Switch to Practice to play the stems together." }).click();
  await player().waitFor();
  if ((await page.evaluate(() => document.documentElement.dataset.mode)) !== "practice") throw new Error("not Practice");
});

await step("Practice lists the parts in order; Play plays them all together", async () => {
  const parts = await player().getByTestId("stem-track").evaluateAll((rows) => rows.map((row) => row.dataset.part));
  if (parts.join() !== "VOCALS,DRUMS,BASS,KEYS") throw new Error(parts.join());
  await player().getByRole("button", { name: "Play" }).click();
  await page.locator('[data-testid="stem-player"][data-state="playing"]').waitFor();
  await page.waitForFunction(() => document.querySelector('[data-testid="stem-time"]')?.textContent?.startsWith("0:01"));
  if (!(await player().getByTestId("stem-time").textContent()).endsWith("/ 0:04")) throw new Error("not the stems' length");
  if (await player().getByText("can't be played").count()) throw new Error("a stem didn't decode");
});

await step("mute one part, solo another", async () => {
  await player().getByRole("button", { name: "Mute Vocals" }).click();
  await track("VOCALS").and(page.locator('[data-audible="false"]')).waitFor();
  await player().getByRole("button", { name: "Solo Drums" }).click();
  const audible = await player().getByTestId("stem-track").evaluateAll((rows) => rows.map((row) => `${row.dataset.part}:${row.dataset.audible}`));
  if (audible.join() !== "VOCALS:false,DRUMS:true,BASS:false,KEYS:false") throw new Error(audible.join());
  await player().getByRole("button", { name: "Solo Drums" }).click();
  await track("BASS").and(page.locator('[data-audible="true"]')).waitFor();
  await track("VOCALS").and(page.locator('[data-audible="false"]')).waitFor();
});

await step("at the end it stops and goes back to the start", async () => {
  await page.locator('[data-testid="stem-player"][data-state="ready"]').waitFor({ timeout: 10_000 });
  if ((await player().getByTestId("stem-time").textContent()) !== "0:00 / 0:04") throw new Error(await player().getByTestId("stem-time").textContent());
});

await step("a set's song has the player too, in Practice", async () => {
  await page.goto(`${WEB}/sets/${set.id}/songs/${item.id}`);
  await page.waitForLoadState("networkidle");
  await track("KEYS").waitFor();
  await player().getByRole("button", { name: "Play" }).click();
  await page.locator('[data-testid="stem-player"][data-state="playing"]').waitFor();
  await player().getByRole("button", { name: "Pause" }).click();
  await page.locator('[data-testid="stem-player"][data-state="ready"]').waitFor();
});

await step("on a phone it fits", async () => {
  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto(`${WEB}/library/${webSong.id}`);
  await page.waitForLoadState("networkidle");
  await player().waitFor();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  if (overflow > 0) throw new Error(`${overflow}px sideways scroll`);
});

await browser.close();
finish();
