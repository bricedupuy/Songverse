// The stem player's transport (issue #162): the combined waveform in the
// minimised bar where there's room; Stop, back to the start; with the
// sections placed, from one to the next, and a section looped - going round
// instead of on - and the keys for them.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { API, WEB, api, call, finish, signIn, stamp, stepper, user } from "../lib/harness.mjs";

const FIXTURES = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../fixtures/stems");

let page;
const step = stepper(() => page);
const me = await user("Transport");
const song = await api(me, "POST", "/song-versions", {
  title: `Transport ${stamp}`,
  language: "en",
  artists: [`Band ${stamp}`],
  content: "{start_of_verse}\n[G]Hello\n{end_of_verse}\n{start_of_chorus}\n[C]World\n{end_of_chorus}\n{start_of_bridge}\n[D]Again\n{end_of_bridge}\n",
  contentFormat: "CHORDPRO",
});
const [verse, chorus, bridge] = (await api(me, "GET", `/song-versions/${song.id}`)).documentJson.sections.map((section) => section.id);
// The files are 20 s: the verse 0-4, the chorus 4-8, the bridge 8 to the end.
const cuePoints = [
  { at: 0, sectionId: verse },
  { at: 4, sectionId: chorus },
  { at: 8, sectionId: bridge },
];
for (const [name, part] of [["Morning Light - Vocals.opus", "VOCALS"], ["Morning Light - Bass.mp3", "BASS"]]) {
  const form = new FormData();
  form.append("type", "AUDIO");
  form.append("stemPart", part);
  form.append("file", new Blob([readFileSync(path.join(FIXTURES, name))]), name);
  const file = await (await fetch(`${API}/song-versions/${song.id}/attachments`, { method: "POST", headers: { Authorization: `Bearer ${me.bearer}` }, body: form })).json();
  await call(me, "PATCH", `/song-versions/${song.id}/attachments/${file.id}`, { cuePoints });
}

const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });
try {
  page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  await signIn(page, me);
  // In Practice, the player minimised.
  await page.evaluate(() => {
    localStorage.setItem("songverse.mode", "practice");
    localStorage.setItem("songverse.stems.expanded", "false");
  });
  const player = () => page.getByTestId("stem-player");
  const position = async () => Number(await player().getByTestId("stem-playhead").inputValue());

  await step("minimised, on a wide screen: the waveform of what's heard, Stop and the sections' buttons", async () => {
    await page.goto(`${WEB}/library/${song.id}`);
    await page.locator('[data-testid="stem-player"][data-state="ready"]').waitFor({ timeout: 20000 });
    if ((await player().getAttribute("data-view")) !== "compact") throw new Error("not minimised");
    await player().getByTestId("stem-compact-waveform").getByTestId("stem-waveform").waitFor();
    await player().getByTestId("stem-stop").waitFor();
    await player().getByTestId("stem-sections").waitFor();
  });

  await step("next and previous section; within a couple of seconds, previous goes to the one before", async () => {
    await player().getByTestId("stem-next-section").click();
    if ((await position()) !== 4) throw new Error(`at ${await position()}`);
    await player().getByTestId("stem-next-section").click();
    if ((await position()) !== 8) throw new Error(`at ${await position()}`);
    await player().getByTestId("stem-previous-section").click();
    if ((await position()) !== 4) throw new Error(`at ${await position()}`);
  });

  await step("the chorus looped: it goes round instead of on into the bridge", async () => {
    await player().getByTestId("stem-loop").click();
    await player().locator('[data-testid="stem-loop"][aria-pressed="true"]').waitFor();
    await player().getByTestId("stem-play").click();
    await page.locator('[data-testid="stem-player"][data-state="playing"]').waitFor();
    // Six seconds: past the chorus's end (8) once, had it gone on.
    let wentRound = false;
    let last = await position();
    for (let i = 0; i < 24; i++) {
      await page.waitForTimeout(250);
      const at = await position();
      if (at < 4 - 0.01 || at >= 8 + 0.15) throw new Error(`out of the loop at ${at}`);
      if (at < last) wentRound = true;
      last = at;
    }
    if (!wentRound) throw new Error("never went round");
  });

  await step("Stop: stopped, back to the loop's start; L turns the loop off, ] to the next section", async () => {
    await player().getByTestId("stem-stop").click();
    await page.locator('[data-testid="stem-player"]:not([data-state="playing"])').waitFor();
    if ((await position()) !== 4) throw new Error(`at ${await position()}`);
    await page.locator("body").press("l");
    await player().locator('[data-testid="stem-loop"][aria-pressed="false"]').waitFor();
    await page.locator("body").press("]");
    if ((await position()) !== 8) throw new Error(`at ${await position()}`);
    await page.locator("body").press("0");
    if ((await position()) !== 0) throw new Error(`at ${await position()}`);
  });

  await step("on a phone: the bar stays as it was, without the waveform", async () => {
    await page.setViewportSize({ width: 375, height: 800 });
    await player().getByTestId("stem-play").waitFor();
    if (await player().getByTestId("stem-compact-waveform").isVisible()) throw new Error("the waveform on a phone");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    if (overflow > 0) throw new Error(`${overflow}px sideways`);
  });
} finally {
  await browser.close();
}
finish();
