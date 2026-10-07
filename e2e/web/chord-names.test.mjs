// Nashville numbers and chord colours (issues #9, #207 phase 2): numbers
// count from the key each part is sung in - a key change keeps them the
// same - and a capo doesn't change them; chords coloured by family. Chosen
// in Chart display or a set's My view, for every chart.
import { chromium } from "playwright";
import { WEB, api, call, check, finish, signIn, stamp, stepper, user } from "../lib/harness.mjs";

let page;
const step = stepper(() => page);
const me = await user("Number reader");
const song = await api(me, "POST", "/song-versions", {
  title: `Numbers ${stamp}`,
  language: "en",
  artists: ["Someone"],
  key: "D",
  capo: 2,
  content: "{key: D}\n{start_of_verse}\n[D]Glory [Em7]to the [D/F#]King of [G]kings, [A7]amen\n{end_of_verse}\n{key: E}\n{start_of_verse}\n[E]Glory [F#m7]to the [E/G#]King of [A]kings, [B7]amen\n{end_of_verse}\n",
  contentFormat: "CHORDPRO",
});
const set = await api(me, "POST", "/setlists", { name: `Numbers Set ${stamp}` });
const item = (await api(me, "POST", `/setlists/${set.id}/items`, { songVersionId: song.id })).items[0];

check("colours are off by default", (await api(me, "GET", "/users/me")).chordColors === false);
check("numbers and colours are the player's own settings", (await call(me, "PATCH", "/users/me", { chordNotation: "NASHVILLE", chordColors: true })).status === 200);
const saved = await api(me, "GET", "/users/me");
check("and saved", saved.chordNotation === "NASHVILLE" && saved.chordColors === true, JSON.stringify(saved));
await api(me, "PATCH", "/users/me", { chordNotation: "LETTERS", chordColors: false });

const browser = await chromium.launch();
page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
await signIn(page, me);
await page.evaluate(() => localStorage.setItem("songverse.mode", "practice"));
const labels = () => page.locator("[data-chord]").evaluateAll((els) => els.map((el) => el.textContent.trim()));

await step("Chart display: Nashville numbers; the key change keeps them, the capo too", async () => {
  await page.goto(`${WEB}/dashboard`);
  await page.getByLabel("Chord names").selectOption("NASHVILLE");
  await page.waitForLoadState("networkidle");
  await page.getByLabel("With a capo").selectOption("FINGERED");
  await page.waitForLoadState("networkidle");
  await page.goto(`${WEB}/library/${song.id}`);
  await page.getByTestId("practice-song").locator("[data-chord]").first().waitFor();
  // Sung in D, then in E: the same numbers both times, capo shapes or not.
  const shown = (await labels()).join(" ");
  if (shown !== "1 2m7 1/3 4 57 1 2m7 1/3 4 57") throw new Error(shown);
});

await step("Chart display: colours by chord type", async () => {
  await page.goto(`${WEB}/dashboard`);
  await page.getByLabel("Chord colours").selectOption("ON");
  await page.waitForLoadState("networkidle");
  await page.goto(`${WEB}/library/${song.id}`);
  const dominant = page.locator('[data-family="dominant"]').first();
  await dominant.waitFor();
  const [red, minor] = [await dominant.evaluate((el) => getComputedStyle(el).color), await page.locator('[data-family="minor"]').first().evaluate((el) => getComputedStyle(el).color)];
  if (red === minor) throw new Error(`dominant and minor both ${red}`);
});

await step("a set's My view: back to letters, colours off", async () => {
  await page.goto(`${WEB}/sets/${set.id}/songs/${item.id}`);
  await page.waitForLoadState("networkidle");
  await page.getByTestId("notation-select").selectOption("LETTERS");
  await page.locator('[data-chord="C"]').first().waitFor(); // D sounding, capo 2 shapes: C
  const before = await page.locator('[data-family="dominant"]').first().evaluate((el) => getComputedStyle(el).color);
  await page.getByRole("button", { name: "Colours" }).click();
  await page.waitForFunction((was) => getComputedStyle(document.querySelector('[data-family="dominant"]')).color !== was, before);
  await page.waitForLoadState("networkidle");
  const after = await api(me, "GET", "/users/me");
  if (after.chordNotation !== "LETTERS" || after.chordColors !== false) throw new Error(JSON.stringify(after));
});

await browser.close();
finish();
