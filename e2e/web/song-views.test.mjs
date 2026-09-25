// A library song in each mode (issue #67): the editor in Edit, its chart in
// Practice (with Edit to go back), full screen in Live; swiping through a
// set in Live; the artists as a grid of round pictures; the theme in the
// account menu, not the header.
import { chromium } from "playwright";
import { WEB, api, finish, signIn, stamp, stepper, user } from "../lib/harness.mjs";

let page;
const step = stepper(() => page);
const me = await user("Viewer");
const song = (title, content, artist = "Someone") => api(me, "POST", "/song-versions", { title, language: "en", artists: [artist], key: "G", content, contentFormat: "CHORDPRO" });
const first = await song(`First ${stamp}`, "{start_of_verse}\n[G]First song [C]words\n{end_of_verse}\n", `Grid One ${stamp}`);
const second = await song(`Second ${stamp}`, "{start_of_verse}\n[D]Second song [A]words\n{end_of_verse}\n", `Grid Two ${stamp}`);
const set = await api(me, "POST", "/setlists", { name: `Swipe set ${stamp}` });
await api(me, "POST", `/setlists/${set.id}/items`, { songVersionId: first.id });
const items = (await api(me, "POST", `/setlists/${set.id}/items`, { songVersionId: second.id })).items;

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, hasTouch: true });
page = await context.newPage();
await signIn(page, me);
const setMode = (mode) => page.evaluate((m) => localStorage.setItem("songverse.mode", m), mode);

await step("Edit: the editor, its tabs", async () => {
  await page.goto(`${WEB}/library/${first.id}`);
  await page.waitForLoadState("networkidle");
  await page.getByRole("tab", { name: "Song info" }).waitFor();
});

await step("Practice: the chart, no tabs; Edit goes back to the editor", async () => {
  await page.getByRole("radiogroup", { name: "Mode" }).getByRole("radio", { name: "Practice" }).click();
  const practice = page.getByTestId("practice-song");
  await practice.getByRole("heading", { name: `First ${stamp}` }).waitFor();
  await practice.locator('[data-chord="G"]').first().waitFor();
  await practice.getByText("First song").waitFor();
  if (await page.getByRole("tab", { name: "Song info" }).count()) throw new Error("the editor's tabs in Practice");
  await practice.getByRole("button", { name: "Edit" }).click();
  await page.getByRole("tab", { name: "Song info" }).waitFor();
  if ((await page.evaluate(() => document.documentElement.dataset.mode)) !== "edit") throw new Error("not Edit");
});

await step("Live: a library song opens full screen, like a set's; × goes back to the library", async () => {
  await setMode("live");
  await page.goto(`${WEB}/library/${first.id}`);
  await page.waitForURL(`**/library/${first.id}/live?back=**`);
  await page.getByTestId("live-view").getByRole("heading", { name: `First ${stamp}` }).waitFor();
  if (await page.getByRole("tab", { name: "Song info" }).count()) throw new Error("the editor's tabs in Live");
  await page.getByRole("button", { name: "Back" }).click();
  await page.waitForURL(`${WEB}/library`);
});

await step("Live in a set: swiping left goes to the next song, right to the previous one", async () => {
  await page.goto(`${WEB}/sets/${set.id}/live/${items[0].id}`);
  await page.getByTestId("live-view").getByRole("heading", { name: `First ${stamp}` }).waitFor();
  const swipe = (from, to) =>
    page.getByTestId("live-scroll").evaluate(
      (element, [x1, x2]) => {
        const touch = (x) => new Touch({ identifier: 1, target: element, clientX: x, clientY: 400 });
        element.dispatchEvent(new TouchEvent("touchstart", { touches: [touch(x1)], changedTouches: [touch(x1)], bubbles: true }));
        element.dispatchEvent(new TouchEvent("touchend", { touches: [], changedTouches: [touch(x2)], bubbles: true }));
      },
      [from, to],
    );
  await swipe(900, 300);
  await page.waitForURL(`**/sets/${set.id}/live/${items[1].id}`);
  await page.getByTestId("live-view").getByRole("heading", { name: `Second ${stamp}` }).waitFor();
  // A short or mostly vertical move isn't a swipe.
  await swipe(600, 560);
  await page.waitForTimeout(300);
  if (!page.url().includes(items[1].id)) throw new Error("moved on a short swipe");
  await swipe(300, 900);
  await page.waitForURL(`**/sets/${set.id}/live/${items[0].id}`);
  await setMode("edit");
});

await step("Artists: a grid of round pictures, the name and the number of songs under each", async () => {
  await page.goto(`${WEB}/library/artists?q=Grid`);
  await page.waitForLoadState("networkidle");
  const one = page.getByTestId("artist-list").getByRole("link", { name: new RegExp(`Grid One ${stamp}`) });
  const two = page.getByTestId("artist-list").getByRole("link", { name: new RegExp(`Grid Two ${stamp}`) });
  await one.getByText("1 song").waitFor();
  const [a, b] = await Promise.all([one.boundingBox(), two.boundingBox()]);
  if (Math.abs(a.y - b.y) > 2) throw new Error("not side by side");
  const picture = await one.locator("span").first().evaluate((el) => {
    const style = getComputedStyle(el);
    return { radius: style.borderRadius, width: el.offsetWidth, height: el.offsetHeight, text: el.textContent };
  });
  if (picture.width !== picture.height || !picture.radius.includes("px") || picture.text !== "GO") throw new Error(JSON.stringify(picture));
});

await step("no breadcrumb; the theme is in the account menu", async () => {
  if (await page.getByRole("navigation", { name: "breadcrumb" }).count()) throw new Error("a breadcrumb");
  if (await page.locator("header").getByRole("button", { name: /Light theme|Dark theme/ }).count()) throw new Error("a theme button in the header");
  await page.getByTestId("account-menu").click();
  await page.getByRole("menu").getByRole("button", { name: /Light theme|Dark theme/ }).waitFor();
  await page.keyboard.press("Escape");
});

await browser.close();
finish();
