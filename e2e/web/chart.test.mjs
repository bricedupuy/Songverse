// The chord chart: chords drawn above the characters they're pinned to,
// spaced so close chords never overlap, transposed in a set's song view,
// and wrapping on a phone.
import { chromium } from "playwright";
import { WEB, api, finish, signIn, stamp, stepper, user } from "../lib/harness.mjs";

let page;
const step = stepper(() => page);
const me = await user("Chart viewer");
const song = await api(me, "POST", "/song-versions", {
  title: `Chart Song ${stamp}`,
  language: "en",
  artists: ["Someone"],
  key: "G",
  content: "{start_of_chorus}\n[Gmaj7]Mo[D/F#]rning light has [Em7]broken\n[G]Here and [C]there and [D]every[Em]where the [C]morning [G]light is [D]shining [G]through\n{end_of_chorus}\n",
  contentFormat: "CHORDPRO",
});
const set = await api(me, "POST", "/setlists", { name: `Chart Set ${stamp}` });
const item = (await api(me, "POST", `/setlists/${set.id}/items`, { songVersionId: song.id, transposeSteps: 2 })).items[0];

const browser = await chromium.launch();
page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
await signIn(page, me);

const box = (locator) => locator.boundingBox();

await step("chords sit above their characters, close ones pushed apart", async () => {
  await page.goto(`${WEB}/library/${song.id}?tab=editor`);
  await page.waitForLoadState("networkidle");
  await page.getByRole("radio", { name: "Preview" }).click();
  const g = page.locator('[data-chord="Gmaj7"]').first();
  const dfs = page.locator('[data-chord="D/F#"]').first();
  await dfs.waitFor();
  const [gBox, dBox] = [await box(g), await box(dfs)];
  if (gBox.x + gBox.width > dBox.x) throw new Error(`Gmaj7 ends at ${gBox.x + gBox.width}, D/F# starts at ${dBox.x}`);
  // "rning" starts right under D/F#; "Mo" is stretched under the wider Gmaj7, with a hyphen in the gap.
  const rest = page.locator("span", { hasText: /^rning$/ }).first();
  const restBox = await box(rest);
  if (Math.abs(restBox.x - dBox.x) > 1) throw new Error(`"rning" at ${restBox.x}, D/F# at ${dBox.x}`);
  const before = await dfs.evaluate((el) => el.parentElement.previousElementSibling?.textContent);
  if (before !== "Gmaj7Mo-") throw new Error(`the cell before D/F# is ${JSON.stringify(before)}, not Gmaj7 over "Mo-"`);
});

await step("a set shows the chords in the set's key", async () => {
  await page.goto(`${WEB}/sets/${set.id}/songs/${item.id}`);
  await page.waitForLoadState("networkidle");
  await page.locator('[data-chord="E/G#"]').first().waitFor();
  const chords = await page.locator("[data-chord]").evaluateAll((els) => els.slice(0, 3).map((el) => el.dataset.chord));
  if (chords.join() !== "Amaj7,E/G#,F#m7") throw new Error(chords.join());
});

await step("a long line wraps on a phone, between words", async () => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto(`${WEB}/sets/${set.id}/songs/${item.id}`);
  await page.waitForLoadState("networkidle");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  if (overflow > 0) throw new Error(`${overflow}px sideways scroll`);
  const lineHeight = await page.locator("[data-line]").nth(1).evaluate((el) => el.getBoundingClientRect().height);
  const firstHeight = await page.locator("[data-line]").first().evaluate((el) => el.getBoundingClientRect().height);
  if (lineHeight < firstHeight * 1.5) throw new Error(`the long line didn't wrap (${lineHeight} vs ${firstHeight})`);
});

await browser.close();
finish();
