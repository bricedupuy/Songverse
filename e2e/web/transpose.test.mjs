// Transposing the stem player (issue #129): the parts are moved as they
// play, the drums and cues left alone unless asked, and everything stays
// together and on time - the stretch node's latency is made up by starting
// early and delaying the parts it doesn't move. The player's mix is recorded
// in the page (a test tap) and measured: a 440 Hz part heard 2 semitones up,
// the drums' click where it was, both starting together. A set's song page
// transposes to the key the set plays in.
import { execFileSync } from "node:child_process";
import { chromium } from "playwright";
import { API, WEB, api, finish, signIn, stamp, stepper, user } from "../lib/harness.mjs";

let page;
const step = stepper(() => page);
const me = await user("Transposer");
const RATE = 48000;

/** A mono 16-bit WAV of `seconds`, silent but for `fill(i)`. */
function wav(seconds, fill) {
  const samples = new Int16Array(RATE * seconds);
  for (let i = 0; i < samples.length; i++) samples[i] = Math.round(fill(i / RATE) * 20000);
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + samples.length * 2, 4);
  header.write("WAVEfmt ", 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(RATE, 24);
  header.writeUInt32LE(RATE * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(samples.length * 2, 40);
  return Buffer.concat([header, Buffer.from(samples.buffer)]);
}
// A held A (440 Hz) from 1 s to 3 s; a 3 kHz click at 1 s and 2 s (the drums).
const tone = wav(4, (t) => (t >= 1 && t < 3 ? 0.5 * Math.sin(2 * Math.PI * 440 * t) : 0));
const clicks = wav(4, (t) => ((t >= 1 && t < 1.01) || (t >= 2 && t < 2.01) ? 0.8 * Math.sin(2 * Math.PI * 3000 * t) : 0));

const song = await api(me, "POST", "/song-versions", { title: `Transposed ${stamp}`, language: "en", artists: ["Someone"], content: "[A]Hold\n", contentFormat: "CHORDPRO", key: "A", tempo: 120 });
for (const [name, bytes, part] of [
  ["Hold - Other.wav", tone, "OTHER"],
  ["Hold - Drums.wav", clicks, "DRUMS"],
]) {
  const form = new FormData();
  form.append("type", "AUDIO");
  form.append("stemPart", part);
  form.append("file", new Blob([bytes], { type: "audio/wav" }), name);
  await fetch(`${API}/song-versions/${song.id}/attachments`, { method: "POST", headers: { Authorization: `Bearer ${me.bearer}` }, body: form });
}

const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });
page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
// The test tap: the player's mix as a stream, to record.
await page.addInitScript(() => {
  window.songverseStems = { starts: [], tap: true };
  localStorage.setItem("songverse.mode", "practice");
  localStorage.setItem("songverse.stems.expanded", "true");
});
await signIn(page, me);
const player = () => page.getByTestId("stem-player");

/** Plays from the start and records the mix for 3.5 s: its samples (48 kHz, mono), decoded by ffmpeg. */
async function recordMix() {
  await page.locator('[data-testid="stem-player"][data-state="ready"]').waitFor({ timeout: 20000 });
  // From the start (the last recording paused near the end).
  await player().getByRole("slider", { name: "Position" }).fill("0");
  const base64 = await page.evaluate(async () => {
    const recorder = new MediaRecorder(window.songverseStems.stream);
    const chunks = [];
    recorder.ondataavailable = (event) => chunks.push(event.data);
    const done = new Promise((resolve) => (recorder.onstop = resolve));
    recorder.start();
    document.querySelector('[data-testid="stem-play"]').click();
    await new Promise((resolve) => setTimeout(resolve, 3600));
    document.querySelector('[data-testid="stem-play"]').click();
    recorder.stop();
    await done;
    const bytes = new Uint8Array(await new Blob(chunks).arrayBuffer());
    let text = "";
    for (const byte of bytes) text += String.fromCharCode(byte);
    return btoa(text);
  });
  const pcm = execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-i", "pipe:0", "-f", "s16le", "-ac", "1", "-ar", String(RATE), "pipe:1"], { input: Buffer.from(base64, "base64") });
  return new Int16Array(pcm.buffer, pcm.byteOffset, pcm.length / 2);
}

/** When something first sounds after `from` (s), and its frequency over the next `span` s by zero crossings. */
function measure(samples, from = 0) {
  let peak = 0;
  for (const value of samples) peak = Math.max(peak, Math.abs(value));
  const onset = samples.findIndex((value, i) => i >= from * RATE && Math.abs(value) > peak * 0.2);
  return onset / RATE;
}
function frequency(samples, start, span = 0.4) {
  let crossings = 0;
  const a = Math.round(start * RATE);
  const b = Math.round((start + span) * RATE);
  for (let i = a + 1; i < b; i++) if (samples[i - 1] < 0 !== samples[i] < 0) crossings++;
  return crossings / 2 / span;
}
/** The loudest the 3 kHz click is, in the window around `at` (s): a band-pass by correlation. */
function clickAt(samples, near) {
  let best = { at: 0, level: 0 };
  const period = RATE / 3000;
  for (let i = Math.round((near - 0.4) * RATE); i < (near + 0.4) * RATE; i += 24) {
    let re = 0;
    let im = 0;
    for (let k = 0; k < 240; k++) {
      const phase = (2 * Math.PI * k) / period;
      re += samples[i + k] * Math.cos(phase);
      im += samples[i + k] * Math.sin(phase);
    }
    const level = Math.hypot(re, im);
    if (level > best.level) best = { at: i / RATE, level };
  }
  return best.at;
}

let plainMix;
await step("as recorded: the A at 440 Hz, the click with it", async () => {
  await page.goto(`${WEB}/library/${song.id}`);
  await player().waitFor();
  const label = await player().getByTestId("stem-transpose-label").textContent();
  if (label !== "A") throw new Error(label);
  plainMix = await recordMix();
  const start = measure(plainMix);
  const f = frequency(plainMix, start + 0.3);
  if (Math.abs(f - 440) > 440 * 0.02) throw new Error(`${f} Hz`);
});

await step("up 2 semitones: the A heard as a B (493.9 Hz), the drums' click not moved, and both where they were", async () => {
  await player().getByRole("button", { name: "Up a semitone" }).click();
  await player().getByRole("button", { name: "Up a semitone" }).click();
  await player().getByTestId("stem-transpose-label").getByText("B (+2)").waitFor();
  await player().getByText("Not transposed").waitFor();
  const mix = await recordMix();
  const start = measure(mix);
  const f = frequency(mix, start + 0.3);
  if (Math.abs(f - 493.88) > 493.88 * 0.02) throw new Error(`${f} Hz`);
  // The tone and the drums' second click keep their distance (1 s), as recorded: the latency made up.
  const plainGap = clickAt(plainMix, measure(plainMix) + 1) - measure(plainMix);
  const gap = clickAt(mix, start + 1) - start;
  if (Math.abs(gap - plainGap) > 0.015) throw new Error(`click ${gap.toFixed(3)} s after the tone, as recorded ${plainGap.toFixed(3)} s`);
});

await step("the drums and cues transposed too, when asked; remembered for the song", async () => {
  await player().getByTestId("stem-transpose-all").click();
  if ((await player().getByTestId("stem-transpose-all").getAttribute("aria-pressed")) !== "true") throw new Error("not on");
  if (await player().getByText("Not transposed").count()) throw new Error("still said not transposed");
  await page.reload();
  await player().getByTestId("stem-transpose-label").getByText("B (+2)").waitFor();
  if ((await player().getByTestId("stem-transpose-all").getAttribute("aria-pressed")) !== "true") throw new Error("not remembered");
  // Back to as recorded.
  await player().getByTestId("stem-transpose-all").click();
  await player().getByRole("button", { name: "Down a semitone" }).click();
  await player().getByRole("button", { name: "Down a semitone" }).click();
  await player().getByTestId("stem-transpose-label").getByText("A", { exact: true }).waitFor();
});

await step("on a set's song page played in C: transposed from A to C (+3) by default", async () => {
  const set = await api(me, "POST", "/setlists", { name: `In C ${stamp}` });
  const [item] = (await api(me, "POST", `/setlists/${set.id}/items`, { songVersionId: song.id })).items;
  await api(me, "PATCH", `/setlists/${set.id}/items/${item.id}`, { transposeSteps: 3 });
  await page.goto(`${WEB}/sets/${set.id}/songs/${item.id}`);
  await player().waitFor();
  await player().getByTestId("stem-transpose-label").getByText("C (+3)").waitFor();
  const mix = await recordMix();
  const f = frequency(mix, measure(mix) + 0.3);
  // A up 3 semitones: C, 523.3 Hz.
  if (Math.abs(f - 523.25) > 523.25 * 0.02) throw new Error(`${f} Hz`);
});

await step("no page errors", async () => {
  if (errors.length) throw new Error(errors.join("\n"));
});

await browser.close();
finish();
