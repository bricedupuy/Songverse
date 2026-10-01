// Ogg Opus where the browser can't decode it (issue #185: Safari before
// 18.4): the stem player decodes it with WebAssembly in workers instead,
// under the app's Content-Security-Policy. Chromium decodes Ogg itself, so
// the fallback is forced here (songverse.audio.decoder = "wasm").
import { execFileSync } from "node:child_process";
import { chromium } from "playwright";
import { API, WEB, api, finish, settledFiles, signIn, stamp, stepper, user } from "../lib/harness.mjs";

let page;
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
    localStorage.setItem("songverse.audio.decoder", "wasm");
  });
  const player = () => page.getByTestId("stem-player");

  await step("decoded with WebAssembly: both parts, as long as they are, their waveforms drawn", async () => {
    await page.goto(`${WEB}/library/${song.id}`);
    await page.locator('[data-testid="stem-player"][data-state="ready"]').waitFor({ timeout: 30000 });
    const fallback = await page.evaluate(() => window.songverseDecoder?.fallback ?? 0);
    if (fallback !== 2) throw new Error(`${fallback} files through the WebAssembly decoder`);
    await player().getByRole("button", { name: "Expand the player" }).click();
    await player().getByTestId("stem-waveform").nth(1).waitFor();
    if (await player().getByText("can't be played").count()) throw new Error("a part didn't decode");
    const time = (await player().getByTestId("stem-time").textContent()).trim();
    if (!time.endsWith("/ 0:04")) throw new Error(time);
  });

  await step("it plays", async () => {
    await player().getByRole("button", { name: "Play", exact: true }).click();
    await page.locator('[data-testid="stem-player"][data-state="playing"]').waitFor();
    await page.waitForFunction(() => document.querySelector('[data-testid="stem-time"]')?.textContent?.startsWith("0:01"));
    await player().getByRole("button", { name: "Pause", exact: true }).click();
  });

  await step("the browser's own decoder otherwise: nothing goes through WebAssembly", async () => {
    await page.evaluate(() => localStorage.removeItem("songverse.audio.decoder"));
    await page.reload();
    await page.locator('[data-testid="stem-player"][data-state="ready"]').waitFor({ timeout: 30000 });
    if ((await page.evaluate(() => window.songverseDecoder?.fallback ?? 0)) !== 0) throw new Error("used WebAssembly");
  });

  await step("no page errors, nothing refused by the Content-Security-Policy", async () => {
    if (errors.length) throw new Error(errors.join("\n"));
  });
} finally {
  await browser.close();
}
finish();
