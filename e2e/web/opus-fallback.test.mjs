// Ogg Opus where Safari can't decode it (issue #185: before 18.4): the stem
// player rewraps the same packets as WebM, which it can. Chromium decodes
// Ogg itself, so the rewrapping is forced here (songverse.audio.decoder =
// "webm"), and what it decodes to is checked against Chromium's own decoding
// of the Ogg file: the same samples, the same length.
import { execFileSync } from "node:child_process";
import { chromium } from "playwright";
import { oggOpusToWebm } from "../../packages/core/dist/index.js";
import { API, WEB, api, finish, settledFiles, signIn, stamp, stepper, user } from "../lib/harness.mjs";

let page;
let rewrappedTime = null;
const step = stepper(() => page);
const me = await user("Opus listener");

/** Four seconds of a tone, as Songverse stores stems: Ogg Opus, stereo. */
const opus = (frequency) =>
  execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", `sine=frequency=${frequency}:sample_rate=48000:duration=4`, "-ac", "2", "-c:a", "libopus", "-b:a", "96k", "-f", "ogg", "pipe:1"]);

const song = await api(me, "POST", "/song-versions", { title: `Opus ${stamp}`, language: "en", artists: ["Band"], content: "[G]Line\n", contentFormat: "CHORDPRO" });
for (const [name, part, frequency] of [["Opus - Bass.opus", "BASS", 110], ["Opus - Keys.opus", "KEYS", 440]]) {
  const form = new FormData();
  form.append("type", "AUDIO");
  form.append("stemPart", part);
  form.append("file", new Blob([opus(frequency)], { type: "audio/ogg" }), name);
  await fetch(`${API}/song-versions/${song.id}/attachments`, { method: "POST", headers: { Authorization: `Bearer ${me.bearer}` }, body: form });
}
const files = await settledFiles(me, song.id);
if (files.length !== 2 || files.some((file) => file.mimeType !== "audio/ogg")) throw new Error(JSON.stringify(files.map((file) => file.mimeType)));

const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });
try {
  page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error" && /Content.Security.Policy|Refused/i.test(message.text())) errors.push(message.text());
  });
  await signIn(page, me);
  await page.evaluate(() => {
    localStorage.setItem("songverse.mode", "practice");
    localStorage.setItem("songverse.audio.decoder", "webm");
  });
  const player = () => page.getByTestId("stem-player");

  await step("rewrapped as WebM: both parts, as long as they are, their waveforms drawn", async () => {
    await page.goto(`${WEB}/library/${song.id}`);
    await page.locator('[data-testid="stem-player"][data-state="ready"]').waitFor({ timeout: 30000 });
    const rewrapped = await page.evaluate(() => window.songverseDecoder?.rewrapped ?? 0);
    if (rewrapped !== 2) throw new Error(`${rewrapped} files rewrapped`);
    await player().getByRole("button", { name: "Expand the player" }).click();
    await player().getByTestId("stem-waveform").nth(1).waitFor();
    if (await player().getByText("can't be played").count()) throw new Error("a part didn't decode");
    // 0:03 or 0:04, depending on the device's rate (4 s at 44.1 kHz is a sample short): as the browser's own decoding, checked below.
    rewrappedTime = (await player().getByTestId("stem-time").textContent()).trim();
    if (!/\/ 0:0[34]$/.test(rewrappedTime)) throw new Error(rewrappedTime);
  });

  await step("it plays", async () => {
    await player().getByRole("button", { name: "Play", exact: true }).click();
    await page.locator('[data-testid="stem-player"][data-state="playing"]').waitFor();
    await page.waitForFunction(() => document.querySelector('[data-testid="stem-time"]')?.textContent?.startsWith("0:01"));
    await player().getByRole("button", { name: "Pause", exact: true }).click();
  });

  await step("rewrapped, it decodes to the very samples the Ogg file does", async () => {
    // The bass part's file, rewrapped here as the app does.
    const ogg = opus(110);
    const sample = { ogg: ogg.toString("base64"), webm: Buffer.from(oggOpusToWebm(new Uint8Array(ogg))).toString("base64") };
    const compare = await page.evaluate(async (bytes) => {
      const ogg = Uint8Array.from(atob(bytes.ogg), (c) => c.charCodeAt(0));
      const webm = Uint8Array.from(atob(bytes.webm), (c) => c.charCodeAt(0));
      const context = new OfflineAudioContext(2, 48000, 48000);
      const [a, b] = await Promise.all([context.decodeAudioData(ogg.buffer), context.decodeAudioData(webm.buffer)]);
      let worst = 0;
      for (let channel = 0; channel < 2; channel++) {
        const x = a.getChannelData(channel);
        const y = b.getChannelData(channel);
        for (let i = 0; i < x.length; i++) worst = Math.max(worst, Math.abs(x[i] - (y[i] ?? 0)));
      }
      return { lengths: [a.length, b.length], worst };
    }, sample);
    if (compare.lengths[0] !== compare.lengths[1] || compare.lengths[0] !== 4 * 48000) throw new Error(JSON.stringify(compare));
    if (compare.worst > 1e-6) throw new Error(JSON.stringify(compare));
  });

  await step("the browser's own decoder otherwise: nothing rewrapped in Chromium", async () => {
    await page.evaluate(() => localStorage.removeItem("songverse.audio.decoder"));
    await page.reload();
    await page.locator('[data-testid="stem-player"][data-state="ready"]').waitFor({ timeout: 30000 });
    if ((await page.evaluate(() => window.songverseDecoder?.rewrapped ?? 0)) !== 0) throw new Error("rewrapped");
    await player().getByRole("button", { name: "Expand the player" }).click();
    const time = (await player().getByTestId("stem-time").textContent()).trim();
    if (time !== rewrappedTime) throw new Error(`${time}, rewrapped ${rewrappedTime}`);
  });

  await step("no page errors, nothing refused by the Content-Security-Policy", async () => {
    if (errors.length) throw new Error(errors.join("\n"));
  });
} finally {
  await browser.close();
}
finish();
