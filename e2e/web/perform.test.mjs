// Perform mode (issue #29): the mode switch at the top right of the header,
// Perform's own dark (or light) look, and a set's songs full screen with
// what's next, autoscroll and keys.
import { chromium } from "playwright";
import { WEB, api, check, finish, signIn, stamp, stepper, user } from "../lib/harness.mjs";

let page;
const step = stepper(() => page);
const me = await user("Performer");
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

const view = await api(me, "GET", `/setlists/${set.id}/items/${firstItem.id}/song`);
check("a set song tells what's next", view.nextTitle === `Closer ${stamp}` && view.nextItemId === secondItem.id, JSON.stringify(view.nextTitle));
const last = await api(me, "GET", `/setlists/${set.id}/items/${secondItem.id}/song`);
check("the last song has nothing next", last.nextTitle === null && last.nextItemId === null);

const browser = await chromium.launch();
page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
await signIn(page, me);

const html = () => page.evaluate(() => ({ mode: document.documentElement.dataset.mode, dark: document.documentElement.classList.contains("dark") }));
// How dark the page is: 0 black, 255 white.
const brightness = () =>
  page.evaluate(() => {
    const canvas = document.createElement("canvas").getContext("2d");
    canvas.fillStyle = getComputedStyle(document.querySelector("[data-testid=perform-view]") ?? document.body).backgroundColor;
    canvas.fillRect(0, 0, 1, 1);
    const [r, g, b] = canvas.getImageData(0, 0, 1, 1).data;
    return (r + g + b) / 3;
  });
const modeSwitch = () => page.getByRole("radiogroup", { name: "Mode" });

await step("Build is the mode to start with, switch at the top right of the header", async () => {
  await page.goto(`${WEB}/sets/${set.id}`);
  await page.waitForLoadState("networkidle");
  await modeSwitch().getByRole("radio", { name: "Build" }).and(page.locator("[aria-checked=true]")).waitFor();
  const box = await modeSwitch().boundingBox();
  if (box.x + box.width < 1280 - 40 || box.y > 56) throw new Error(`the switch is at ${JSON.stringify(box)}`);
  const state = await html();
  if (state.mode !== "build" || state.dark) throw new Error(JSON.stringify(state));
});

await step("Perform on a set opens its first song full screen, dark", async () => {
  await page.getByRole("link", { name: "Perform" }).click();
  await page.waitForURL(`**/sets/${set.id}/perform/${firstItem.id}`);
  await page.getByTestId("perform-view").waitFor();
  await page.getByRole("heading", { name: `Opener ${stamp}` }).waitFor();
  const state = await html();
  if (state.mode !== "perform" || !state.dark) throw new Error(JSON.stringify(state));
  if ((await brightness()) > 60) throw new Error(`background brightness ${await brightness()}`);
  // Full screen: no sidebar.
  if (await page.getByRole("link", { name: "Library", exact: true }).isVisible()) throw new Error("the sidebar is showing");
  await modeSwitch().getByRole("radio", { name: "Perform" }).and(page.locator("[aria-checked=true]")).waitFor();
  await page.getByTestId("perform-next").getByText(`Next: Closer ${stamp}`).waitFor();
  await page.locator('[data-chord="G"]').first().waitFor();
  const details = await page.getByTestId("perform-details").innerText();
  if (!details.includes("G") || !details.includes("400 BPM")) throw new Error(details);
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
  const scrollTop = () => page.getByTestId("perform-scroll").evaluate((el) => el.scrollTop);
  await page.getByRole("button", { name: "Faster" }).click();
  await page.getByTestId("perform-speed").getByText("110%").waitFor();
  await page.locator("body").click({ position: { x: 640, y: 400 } });
  await page.keyboard.press("Space");
  await page.getByRole("button", { name: "Pause scrolling" }).waitFor();
  await page.waitForTimeout(1500);
  const moved = await scrollTop();
  if (moved <= 0) throw new Error("didn't scroll");
  await page.keyboard.press("Space");
  await page.getByRole("button", { name: "Start scrolling" }).waitFor();
  const paused = await scrollTop();
  await page.waitForTimeout(500);
  if ((await scrollTop()) !== paused) throw new Error("still scrolling after pausing");
});

await step("the right arrow goes to the next song; the last says the set ends", async () => {
  await page.keyboard.press("ArrowRight");
  await page.waitForURL(`**/perform/${secondItem.id}`);
  await page.getByRole("heading", { name: `Closer ${stamp}` }).waitFor();
  await page.getByTestId("perform-next").getByText("End of the set").waitFor();
  await page.keyboard.press("ArrowLeft");
  await page.waitForURL(`**/perform/${firstItem.id}`);
});

await step("Perform has a light stage theme too, remembered", async () => {
  await page.getByRole("button", { name: "Light stage" }).click();
  let state = await html();
  if (state.mode !== "perform" || state.dark) throw new Error(JSON.stringify(state));
  await page.reload();
  await page.getByTestId("perform-view").waitFor();
  state = await html();
  if (state.dark) throw new Error("dark again after reloading");
  if ((await brightness()) < 200) throw new Error(`background brightness ${await brightness()}`);
  await page.getByRole("button", { name: "Dark stage" }).click();
  if (!(await html()).dark) throw new Error("not dark again");
});

await step("switching to Build goes back to the song's page, light", async () => {
  await modeSwitch().getByRole("radio", { name: "Build" }).click();
  await page.waitForURL(`**/sets/${set.id}/songs/${firstItem.id}`);
  await page.getByText("My view").waitFor();
  const state = await html();
  if (state.mode !== "build" || state.dark) throw new Error(JSON.stringify(state));
  await page.reload();
  await page.waitForLoadState("networkidle");
  if ((await html()).mode !== "build") throw new Error("not Build after reloading");
});

await step("in Perform, a set's songs open full screen", async () => {
  await page.goto(`${WEB}/sets/${set.id}`);
  await page.waitForLoadState("networkidle");
  await modeSwitch().getByRole("radio", { name: "Perform" }).click();
  if (!(await html()).dark) throw new Error("the set page isn't dark in Perform");
  await page.getByTestId("set-song-row").getByRole("link", { name: `Closer ${stamp}` }).click();
  await page.waitForURL(`**/perform/${secondItem.id}`);
  await page.getByTestId("perform-view").waitFor();
});

await step("on a phone: no sideways scroll, the switch still in the header", async () => {
  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto(`${WEB}/sets/${set.id}/perform/${firstItem.id}`);
  await page.getByTestId("perform-view").waitFor();
  await page.waitForLoadState("networkidle");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  if (overflow > 0) throw new Error(`${overflow}px sideways scroll`);
  const box = await modeSwitch().boundingBox();
  if (box.x + box.width > 360 || box.y > 60) throw new Error(`the switch is at ${JSON.stringify(box)}`);
  await modeSwitch().getByRole("radio", { name: "Build" }).click();
  await page.waitForURL(`**/songs/${firstItem.id}`);
});

await browser.close();
finish();
