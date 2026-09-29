// Recording a part in the browser (issue #123): multitracks - parts recorded
// together, sharing a key, tempo, time signature and first beat - and the
// recorder, which starts a new one with the metronome only or adds a part
// to one, hearing its other parts. Chromium's fake microphone stands in
// for a real one.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { API, WEB, api, call, check, finish, signIn, stamp, stepper, user } from "../lib/harness.mjs";

const FIXTURES = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../fixtures/stems");

let page;
const step = stepper(() => page);
const me = await user("Recorder");
const song = (title) => api(me, "POST", "/song-versions", { title, language: "en", artists: [`Band ${stamp}`], content: "[G]Hello [C]world\n", contentFormat: "CHORDPRO", tempo: 100, timeSignature: "4/4" });
const upload = async (songId, name, fields = {}, bytes = readFileSync(path.join(FIXTURES, name))) => {
  const form = new FormData();
  form.append("type", "AUDIO");
  for (const [key, value] of Object.entries(fields)) form.append(key, value);
  form.append("file", new Blob([bytes], { type: "audio/mpeg" }), name);
  const res = await fetch(`${API}/song-versions/${songId}/attachments`, { method: "POST", headers: { Authorization: `Bearer ${me.bearer}` }, body: form });
  return { status: res.status, body: await res.json().catch(() => null) };
};
const files = (songId) => api(me, "GET", `/song-versions/${songId}/attachments`);

// --- the API: a file's multitrack and what it was recorded in, on upload and after
const apiSong = await song(`Multitracks API ${stamp}`);
let r = await upload(apiSong.id, "03 drums.mp3", { stemPart: "DRUMS", multitrackId: "mtapi0000001", multitrackName: "Live", recordingTempo: "92.5", recordingTimeSignature: "6/8", recordingFirstBeat: "1.5", recordingKey: "Bb" });
check(
  "uploaded into a multitrack, with what it was recorded in",
  r.status === 201 && r.body.multitrackId === "mtapi0000001" && r.body.multitrackName === "Live" && r.body.recordingTempo === 92.5 && r.body.recordingTimeSignature === "6/8" && r.body.recordingFirstBeat === 1.5 && r.body.recordingKey === "Bb",
  JSON.stringify(r.body),
);
const live = r.body;
r = await upload(apiSong.id, "03 drums.mp3", { stemPart: "DRUMS", multitrackId: "no way" });
check("a multitrack id that isn't one is refused", r.status === 400 && r.body.message.some((m) => m.includes("multitrackId")), JSON.stringify(r.body));
r = await upload(apiSong.id, "03 drums.mp3", { recordingTimeSignature: "4/3" });
check("so is a time signature that isn't one", r.status === 400, JSON.stringify(r.body));
r = await upload(apiSong.id, "03 drums.mp3", { recordingTempo: "fast" });
check("and a tempo that isn't a number", r.status === 400 && r.body.message.includes("recordingTempo must be a number"), JSON.stringify(r.body));
r = await call(me, "PATCH", `/song-versions/${apiSong.id}/attachments/${live.id}`, { multitrackName: "Live at home", recordingTimeSignature: "12/8" });
check("renamed, another time signature", r.status === 200 && r.body.multitrackName === "Live at home" && r.body.recordingTimeSignature === "12/8", JSON.stringify(r.body));
r = await call(me, "PATCH", `/song-versions/${apiSong.id}/attachments/${live.id}`, { multitrackId: null, multitrackName: "" });
check("back among the song's original stems", r.status === 200 && r.body.multitrackId === null && r.body.multitrackName === null, JSON.stringify(r.body));

// --- the web app
const webSong = await song(`Recorded ${stamp}`);
const browser = await chromium.launch({ args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", "--autoplay-policy=no-user-gesture-required"] });
const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, permissions: ["microphone"] });
page = await context.newPage();
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
await signIn(page, me);
const dialog = () => page.getByTestId("recorder");

/** Records a take of about `seconds` past the count-in, and keeps it. */
async function recordAndKeep(seconds) {
  await page.locator('[data-testid="recorder"][data-phase="ready"]').waitFor({ timeout: 15000 });
  await dialog().getByTestId("recorder-start").click();
  await dialog().getByText(/Recording 0:0[1-9]/).waitFor({ timeout: 15000 });
  await page.waitForTimeout(seconds * 1000);
  await dialog().getByTestId("recorder-stop").click();
  await dialog().getByTestId("recorder-take").waitFor();
  // Heard back, nudged a little.
  await dialog().getByTestId("recorder-preview").click();
  await dialog().getByRole("button", { name: "Stop" }).waitFor();
  await dialog().getByTestId("recorder-nudge").fill("12");
  await dialog().getByText("+12 ms").waitFor();
  await dialog().getByTestId("recorder-keep").click();
  await dialog().waitFor({ state: "detached", timeout: 15000 });
}

let first;
await step("the first layer, with the metronome only: a new multitrack at its own tempo and time signature", async () => {
  await page.goto(`${WEB}/library/${webSong.id}?tab=audio`);
  await page.waitForLoadState("networkidle");
  await page.getByTestId("record-new").click();
  await dialog().getByRole("heading", { name: "Record a new multitrack" }).waitFor();
  await dialog().getByTestId("recorder-name").fill("Acoustic");
  await dialog().getByTestId("recorder-tempo").fill("90");
  await dialog().getByTestId("recorder-signature").selectOption("3/4");
  await dialog().getByTestId("recorder-part").selectOption({ label: "Guitar" });
  await dialog().getByTestId("recorder-latency").getByText(/Delay taken off: \d+ ms \(the browser's estimate\)/).waitFor({ timeout: 15000 });
  // A bar of count-in (2 s at 90 BPM in 3/4) before the take's first beat.
  await page.locator('[data-testid="recorder"][data-phase="ready"]').waitFor({ timeout: 15000 });
  await dialog().getByTestId("recorder-start").click();
  await dialog().getByText("Count-in…").waitFor();
  await dialog().getByText(/Recording 0:0[1-9]/).waitFor({ timeout: 15000 });
  await page.waitForTimeout(1500);
  await dialog().getByTestId("recorder-stop").click();
  await dialog().getByTestId("recorder-keep").click();
  await dialog().waitFor({ state: "detached", timeout: 15000 });
  [first] = await files(webSong.id);
  const ok =
    first?.stemPart === "GUITAR" &&
    first.mimeType === "audio/wav" &&
    /^mt[0-9a-f]{24}$/.test(first.multitrackId) &&
    first.multitrackName === "Acoustic" &&
    first.recordingTempo === 90 &&
    first.recordingTimeSignature === "3/4" &&
    first.recordingFirstBeat === 2 &&
    first.visibility === "PRIVATE";
  if (!ok) throw new Error(JSON.stringify(first));
});

await step("the take is a WAV file from the multitrack's 0:00, count-in included", async () => {
  const res = await fetch(`${API}/song-versions/${webSong.id}/attachments/${first.id}/download`, { headers: { Authorization: `Bearer ${me.bearer}` } });
  const wav = Buffer.from(await res.arrayBuffer());
  const rate = wav.readUInt32LE(24);
  const seconds = wav.readUInt32LE(40) / 2 / rate;
  if (wav.toString("ascii", 0, 4) !== "RIFF" || wav.readUInt16LE(22) !== 1 || ![44100, 48000].includes(rate)) throw new Error(wav.subarray(0, 44).toString("hex"));
  // The count-in (2 s), a second or more recorded, and the time to stop.
  if (seconds < 3 || seconds > 8) throw new Error(`${seconds} s`);
  // The fake microphone's beeps are in it.
  let peak = 0;
  for (let i = 44; i < wav.length; i += 2) peak = Math.max(peak, Math.abs(wav.readInt16LE(i)));
  if (peak < 1000) throw new Error(`silent: ${peak}`);
});

await step("a part added to it: hearing the others, with the multitrack's own tempo, time signature and first beat", async () => {
  await page.reload();
  await page.waitForLoadState("networkidle");
  const box = page.locator('[data-testid="stems-recording"]').filter({ hasText: "Acoustic" });
  await box.getByText("1 part").waitFor();
  await box.getByTestId("record-part").click();
  await dialog().getByRole("heading", { name: "Record a part of Acoustic" }).waitFor();
  await dialog().getByTestId("recorder-beat").getByText("90 BPM · 3/4").waitFor();
  await dialog().getByTestId("recorder-part").selectOption({ label: "Vocals" });
  // The guitar, to hear or not.
  await dialog().getByRole("checkbox", { name: "Guitar" }).waitFor({ timeout: 15000 });
  if (!(await dialog().getByRole("checkbox", { name: "Guitar" }).isChecked())) throw new Error("the guitar isn't heard");
  await recordAndKeep(1);
  const all = await files(webSong.id);
  const vocals = all.find((file) => file.stemPart === "VOCALS");
  const ok = all.length === 2 && vocals?.multitrackId === first.multitrackId && vocals.multitrackName === "Acoustic" && vocals.recordingTempo === 90 && vocals.recordingTimeSignature === "3/4" && vocals.recordingFirstBeat === 2;
  if (!ok) throw new Error(JSON.stringify(all));
});

await step("stems uploaded as before are the song's original stems, listed first", async () => {
  r = await upload(webSong.id, "Morning Light - Bass.mp3", { stemPart: "BASS" });
  if (r.status !== 201) throw new Error(JSON.stringify(r.body));
  await page.reload();
  await page.waitForLoadState("networkidle");
  const boxes = await page.getByTestId("stems-recording").evaluateAll((els) => els.map((el) => `${el.dataset.multitrack || "original"}:${el.querySelector("p")?.textContent}`));
  if (boxes.length !== 2 || !boxes[0].startsWith("original:Original stems · 1 part") || !boxes[1].includes("Acoustic · 2 parts")) throw new Error(boxes.join(" | "));
});

await step("in Practice, the player offers the multitracks and plays the one chosen", async () => {
  await page.getByRole("button", { name: "Switch to Practice to play the stems together." }).click();
  const player = page.getByTestId("stem-player");
  await player.waitFor();
  await player.getByRole("button", { name: "Expand the player" }).click();
  const picker = player.getByTestId("stem-multitrack");
  const options = await picker.locator("option").allTextContents();
  if (options.join() !== "Original stems,Acoustic") throw new Error(options.join());
  const parts = async () => (await player.getByTestId("stem-track").evaluateAll((els) => els.map((el) => el.dataset.part))).join();
  if ((await parts()) !== "BASS") throw new Error(await parts());
  await picker.selectOption({ label: "Acoustic" });
  await page.waitForFunction(() => [...document.querySelectorAll('[data-testid="stem-track"]')].map((el) => el.dataset.part).join() === "VOCALS,GUITAR");
  await player.getByTestId("stem-recorded").getByText("Recorded in 90 BPM · 3/4").waitFor();
  await player.getByTestId("stem-play").click();
  await page.locator('[data-testid="stem-player"][data-state="playing"]').waitFor({ timeout: 15000 });
  await player.getByTestId("stem-play").click();
  // Remembered for the song.
  await page.reload();
  await page.getByTestId("stem-multitrack").waitFor();
  if ((await page.getByTestId("stem-multitrack").inputValue()) !== first.multitrackId) throw new Error(await page.getByTestId("stem-multitrack").inputValue());
});

await step("a file moved into a new multitrack of its own: another version", async () => {
  await page.goto(`${WEB}/library/${webSong.id}?tab=audio`);
  await page.evaluate(() => localStorage.setItem("songverse.mode", "edit"));
  await page.reload();
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Multitrack of Morning Light - Bass.mp3").selectOption({ label: "New multitrack" });
  let bass;
  for (let i = 0; i < 25; i++) {
    bass = (await files(webSong.id)).find((file) => file.stemPart === "BASS");
    if (bass?.multitrackId) break;
    await page.waitForTimeout(200);
  }
  if (!bass?.multitrackId || bass.multitrackId === first.multitrackId) throw new Error(JSON.stringify(bass));
  await page.locator(`[data-testid="stems-recording"][data-multitrack="${bass.multitrackId}"]`).getByText("Multitrack 2").waitFor();
});

await step("no page errors", async () => {
  if (errors.length) throw new Error(errors.join("\n"));
});

await browser.close();
finish();
