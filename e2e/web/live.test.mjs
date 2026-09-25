// The modes (issues #29, #47): Edit, Practice and Live at the top right of
// the header, each with its own look; Edit and Practice light or dark (the
// device's to start with), Live always dark, with a set's songs full screen,
// what's next, autoscroll and keys.
import { chromium } from "playwright";
import { WEB, api, check, finish, signIn, stamp, stepper, user } from "../lib/harness.mjs";

let page;
const step = stepper(() => page);
const me = await user("Live player");
// Long enough to scroll, and quick (400 BPM) so autoscroll moves within the test.
const verses = Array.from({ length: 30 }, (_, i) => `[G]Line ${i + 1} of the [C]song and [D]on it goes`).join("\n");
const first = await api(me, "POST", "/song-versions", {
  title: `Opener ${stamp}`,
  language: "en",
  artists: ["Someone"],
  key: "G",
  tempo: 400,
  content: `{start_of_verse}\n${verses}\n{end_of_verse}\n`,
  contentFormat: "CHORDPRO",
});
const second = await api(me, "POST", "/song-versions", {
  title: `Closer ${stamp}`,
  language: "en",
  artists: ["Someone"],
  key: "C",
  content: "{start_of_chorus}\n[C]Last [F]song [G]tonight\n{end_of_chorus}\n",
  contentFormat: "CHORDPRO",
});
const set = await api(me, "POST", "/setlists", { name: `Gig ${stamp}` });
await api(me, "POST", `/setlists/${set.id}/items`, { songVersionId: first.id });
const items = (await api(me, "POST", `/setlists/${set.id}/items`, { songVersionId: second.id })).items;
const [firstItem, secondItem] = items;

// In a numbered songbook with a volume: Live shows "ABBR 12 · ABBR2" (issue #59).
const abbr = [...String(stamp).slice(-5)].map((digit) => "ABCDEFGHIJ"[Number(digit)]).join("");
const book = await api(me, "POST", "/songbooks", { name: `Live book ${stamp}`, kind: "NUMBERED", abbreviation: abbr });
await api(me, "PATCH", `/songbooks/${book.id}`, { sections: [{ label: `${abbr}2`, start: 10, end: 20 }] });
await api(me, "POST", `/songbooks/${book.id}/entries`, { songVersionId: first.id, entryCode: "12" });
const view = await api(me, "GET", `/setlists/${set.id}/items/${firstItem.id}/song`);
check("a set song tells what's next", view.nextTitle === `Closer ${stamp}` && view.nextItemId === secondItem.id, JSON.stringify(view.nextTitle));
const last = await api(me, "GET", `/setlists/${set.id}/items/${secondItem.id}/song`);
check("the last song has nothing next", last.nextTitle === null && last.nextItemId === null);

const browser = await chromium.launch();
// A device set to light, then one set to dark.
const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, colorScheme: "light" });
page = await context.newPage();
await signIn(page, me);

const html = () =>
  page.evaluate(() => ({
    mode: document.documentElement.dataset.mode,
    dark: document.documentElement.classList.contains("dark"),
    background: getComputedStyle(document.documentElement).getPropertyValue("--background").trim(),
    primary: getComputedStyle(document.documentElement).getPropertyValue("--primary").trim(),
  }));
// How dark the page is: 0 black, 255 white.
const brightness = () =>
  page.evaluate(() => {
    const canvas = document.createElement("canvas").getContext("2d");
    canvas.fillStyle = getComputedStyle(document.querySelector("[data-testid=live-view]") ?? document.body).backgroundColor;
    canvas.fillRect(0, 0, 1, 1);
    const [r, g, b] = canvas.getImageData(0, 0, 1, 1).data;
    return (r + g + b) / 3;
  });
const modeSwitch = () => page.getByRole("radiogroup", { name: "Mode" });
const checked = (name) => modeSwitch().getByRole("radio", { name }).and(page.locator("[aria-checked=true]")).waitFor();
const looks = {};

await step("Edit to start with, following the device (light), switch at the top right", async () => {
  await page.goto(`${WEB}/sets/${set.id}`);
  await page.waitForLoadState("networkidle");
  await checked("Edit");
  const box = await modeSwitch().boundingBox();
  if (box.x + box.width < 1280 - 80 || box.y > 56) throw new Error(`the switch is at ${JSON.stringify(box)}`);
  const state = await html();
  if (state.mode !== "edit" || state.dark) throw new Error(JSON.stringify(state));
  looks.editLight = state;
});

await step("Edit's moon makes it dark, remembered; the sun follows the device again", async () => {
  await page.getByRole("button", { name: "Dark theme" }).click();
  let state = await html();
  if (!state.dark) throw new Error("not dark");
  looks.editDark = state;
  await page.reload();
  await page.waitForLoadState("networkidle");
  if (!(await html()).dark) throw new Error("light again after reloading");
  await page.getByRole("button", { name: "Light theme" }).click();
  state = await html();
  const stored = await page.evaluate(() => localStorage.getItem("songverse.theme"));
  if (state.dark || stored !== null) throw new Error(`dark: ${state.dark}, stored theme: ${stored}`);
});

await step("Practice has its own look, light and dark, and a set's songs open as usual", async () => {
  await modeSwitch().getByRole("radio", { name: "Practice" }).click();
  let state = await html();
  if (state.mode !== "practice" || state.dark) throw new Error(JSON.stringify(state));
  if (state.primary === looks.editLight.primary) throw new Error("the same colours as Edit");
  await page.getByRole("button", { name: "Dark theme" }).click();
  state = await html();
  if (!state.dark) throw new Error("not dark");
  looks.practiceDark = state;
  await page.getByTestId("set-song-row").getByRole("link", { name: `Opener ${stamp}` }).click();
  await page.waitForURL(`**/sets/${set.id}/songs/${firstItem.id}`);
  await page.getByText("My view").waitFor();
  await page.getByRole("button", { name: "Light theme" }).click();
});

await step("Live on a set opens its first song full screen, dark, with no theme button", async () => {
  await page.goto(`${WEB}/sets/${set.id}`);
  await page.waitForLoadState("networkidle");
  await page.getByRole("link", { name: "Live", exact: true }).click();
  await page.waitForURL(`**/sets/${set.id}/live/${firstItem.id}`);
  await page.getByTestId("live-view").waitFor();
  await page.getByRole("heading", { name: `Opener ${stamp}` }).waitFor();
  const state = await html();
  if (state.mode !== "live" || !state.dark) throw new Error(JSON.stringify(state));
  if ((await brightness()) > 60) throw new Error(`background brightness ${await brightness()}`);
  // Live's dark isn't Edit's or Practice's.
  if (new Set([state.background, looks.editDark.background, looks.practiceDark.background]).size !== 3) throw new Error("dark themes not all different");
  if (await page.getByRole("button", { name: /Light theme|Dark theme/ }).count()) throw new Error("Live has a theme button");
  // Full screen: no sidebar.
  if (await page.getByRole("link", { name: "Library", exact: true }).isVisible()) throw new Error("the sidebar is showing");
  await checked("Live");
  await page.getByTestId("live-next").getByText(`Next: Closer ${stamp}`).waitFor();
  await page.locator('[data-chord="G"]').first().waitFor();
  const details = await page.getByTestId("live-details").innerText();
  if (!details.includes("G") || !details.includes("400 BPM") || !details.includes(`${abbr} 12 · ${abbr}2`)) throw new Error(details);
});

await step("the chart is big: bigger text, smaller text", async () => {
  const size = () => page.locator("[data-line]").first().evaluate((el) => el.getBoundingClientRect().height);
  const before = await size();
  await page.getByRole("button", { name: "Bigger text" }).click();
  const after = await size();
  if (after <= before) throw new Error(`${before} -> ${after}`);
  await page.getByRole("button", { name: "Smaller text" }).click();
});

await step("autoscroll: Space starts and pauses it, faster nudges it", async () => {
  const scrollTop = () => page.getByTestId("live-scroll").evaluate((el) => el.scrollTop);
  await page.getByRole("button", { name: "Faster" }).click();
  await page.getByTestId("live-speed").getByText("110%").waitFor();
  await page.locator("body").click({ position: { x: 640, y: 400 } });
  await page.keyboard.press("Space");
  await page.getByRole("button", { name: "Pause scrolling" }).waitFor();
  await page.waitForTimeout(1500);
  if ((await scrollTop()) <= 0) throw new Error("didn't scroll");
  await page.keyboard.press("Space");
  await page.getByRole("button", { name: "Start scrolling" }).waitFor();
  const paused = await scrollTop();
  await page.waitForTimeout(500);
  if ((await scrollTop()) !== paused) throw new Error("still scrolling after pausing");
});

await step("the right arrow goes to the next song; the last says the set ends", async () => {
  await page.keyboard.press("ArrowRight");
  await page.waitForURL(`**/live/${secondItem.id}`);
  await page.getByRole("heading", { name: `Closer ${stamp}` }).waitFor();
  await page.getByTestId("live-next").getByText("End of the set").waitFor();
  await page.keyboard.press("ArrowLeft");
  await page.waitForURL(`**/live/${firstItem.id}`);
});

await step("leaving Live for Practice goes back to the song's page, in Practice's look", async () => {
  await modeSwitch().getByRole("radio", { name: "Practice" }).click();
  await page.waitForURL(`**/sets/${set.id}/songs/${firstItem.id}`);
  await page.getByText("My view").waitFor();
  const state = await html();
  if (state.mode !== "practice" || state.dark) throw new Error(JSON.stringify(state));
  await page.reload();
  await page.waitForLoadState("networkidle");
  if ((await html()).mode !== "practice") throw new Error("not Practice after reloading");
});

await step("in Live, a set's songs open full screen", async () => {
  await page.goto(`${WEB}/sets/${set.id}`);
  await page.waitForLoadState("networkidle");
  await modeSwitch().getByRole("radio", { name: "Live" }).click();
  if (!(await html()).dark) throw new Error("the set page isn't dark in Live");
  await page.getByTestId("set-song-row").getByRole("link", { name: `Closer ${stamp}` }).click();
  await page.waitForURL(`**/live/${secondItem.id}`);
  await page.getByTestId("live-view").waitFor();
});

await step("on a phone: no sideways scroll, the switch still in the header", async () => {
  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto(`${WEB}/sets/${set.id}/live/${firstItem.id}`);
  await page.getByTestId("live-view").waitFor();
  await page.waitForLoadState("networkidle");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  if (overflow > 0) throw new Error(`${overflow}px sideways scroll`);
  const box = await modeSwitch().boundingBox();
  if (box.x + box.width > 360 || box.y > 60) throw new Error(`the switch is at ${JSON.stringify(box)}`);
  await modeSwitch().getByRole("radio", { name: "Edit" }).click();
  await page.waitForURL(`**/songs/${firstItem.id}`);
});
await context.close();

await step("on a dark device, Edit starts dark; the saved mode comes back, an unknown one is Edit", async () => {
  const dark = await browser.newContext({ viewport: { width: 1280, height: 900 }, colorScheme: "dark" });
  page = await dark.newPage();
  await signIn(page, me);
  await page.goto(`${WEB}/sets/${set.id}`);
  await page.waitForLoadState("networkidle");
  let state = await html();
  if (state.mode !== "edit" || !state.dark) throw new Error(JSON.stringify(state));
  await page.evaluate(() => localStorage.setItem("songverse.mode", "live"));
  await page.reload();
  await page.waitForLoadState("networkidle");
  state = await html();
  if (state.mode !== "live") throw new Error(JSON.stringify(state));
  await checked("Live");
  await page.evaluate(() => localStorage.setItem("songverse.mode", "perform"));
  await page.reload();
  await page.waitForLoadState("networkidle");
  state = await html();
  if (state.mode !== "edit") throw new Error(JSON.stringify(state));
  await checked("Edit");
  await dark.close();
});

await browser.close();
finish();
