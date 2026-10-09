// Live's controls (issue #224): in a footer, floating over the chart - in a
// corner, see-through, fading after a few seconds and back with a touch -
// or hidden, the keys still doing everything; each control can be left out.
// Kept with Live's display settings.
import { chromium } from "playwright";
import { WEB, api, finish, signIn, stamp, stepper, user } from "../lib/harness.mjs";

let page;
const step = stepper(() => page);
const me = await user("Live controls");
const song = (title) =>
  api(me, "POST", "/song-versions", {
    title: `${title} ${stamp}`,
    language: "en",
    artists: ["Band"],
    key: "G",
    content: "{start_of_verse}\n[G]Amazing [C]grace how [G]sweet the [D]sound\n{end_of_verse}\n{start_of_chorus}\n[C]My chains are [G]gone\n{end_of_chorus}\n",
    contentFormat: "CHORDPRO",
  });
const [first, second] = await Promise.all([song("First"), song("Second")]);
const set = await api(me, "POST", "/setlists", { name: `Controls ${stamp}` });
const items = [];
for (const one of [first, second]) items.push((await api(me, "POST", `/setlists/${set.id}/items`, { songVersionId: one.id })).items?.at(-1)?.id);
const ids = (await api(me, "GET", `/setlists/${set.id}`)).items.map((item) => item.id);
const saved = async (check) => {
  for (let i = 0; i < 30; i++) {
    const found = (await api(me, "GET", "/users/me")).displaySettings ?? {};
    if (check(found)) return found;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`not saved: ${JSON.stringify((await api(me, "GET", "/users/me")).displaySettings)}`);
};

const browser = await chromium.launch();
try {
  page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await signIn(page, me);
  const controls = () => page.getByTestId("live-controls");
  const panel = () => page.getByTestId("display-panel");
  const openControls = async () => {
    await page.getByTestId("display-open").click();
    await panel().getByTestId("display-section").click();
    await page.getByTestId("display-section-controls").click();
  };

  await step("a footer by default", async () => {
    await page.goto(`${WEB}/sets/${set.id}/live/${ids[0]}`);
    await page.getByTestId("live-view").waitFor();
    await page.locator('[data-testid="live-controls"][data-layout="footer"]').waitFor();
  });

  await step("Controls is Live's own section of the Display panel", async () => {
    await openControls();
    await panel().getByTestId("display-controls-footer").waitFor();
    // Floating: where, and how see-through.
    await panel().getByTestId("display-controls-floating").click();
    await panel().getByTestId("display-controls-position-bottom-left").click();
    await panel().getByTestId("display-controls-opacity").fill("50");
    await panel().getByTestId("display-control-transpose").click();
    await panel().getByTestId("display-control-structure").click();
    await page.getByTestId("display-close").click();
    await panel().waitFor({ state: "detached" });
    await saved((found) => found.LIVE?.controls === "floating" && found.LIVE.controlsPosition === "bottom-left" && found.LIVE.controlsOpacity === 0.5 && found.LIVE.hiddenControls?.length === 2);
  });

  await step("floating: round buttons over the chart, bottom left, half see-through, big enough to hit", async () => {
    await page.locator('[data-testid="live-controls"][data-layout="floating"][data-position="bottom-left"]').waitFor();
    // Touched just now (the panel's close): awake.
    await page.mouse.click(200, 400);
    await page.locator('[data-testid="live-controls"]:not([data-faded])').waitFor();
    const opacity = await controls().evaluate((el) => el.style.opacity);
    if (opacity !== "0.5") throw new Error(`opacity ${opacity}`);
    const box = await controls().boundingBox();
    if (!box || box.x > 40 || box.y + box.height < 844 - 60) throw new Error(`not bottom left: ${JSON.stringify(box)}`);
    for (const button of await controls().getByRole("button").all()) {
      const size = await button.boundingBox();
      if (!size || size.width < 48 || size.height < 48) throw new Error(`a button ${size?.width}×${size?.height}`);
    }
  });

  await step("they fade after a few seconds, and come back with a touch", async () => {
    await page.locator('[data-testid="live-controls"][data-faded]').waitFor({ timeout: 8000 });
    const faded = await controls().evaluate((el) => [el.style.opacity, getComputedStyle(el).pointerEvents]);
    if (Number(faded[0]) > 0.15 || faded[1] !== "none") throw new Error(`faded: ${faded}`);
    await page.mouse.click(200, 300);
    await page.locator('[data-testid="live-controls"]:not([data-faded])').waitFor();
    // A key too.
    await page.locator('[data-testid="live-controls"][data-faded]').waitFor({ timeout: 8000 });
    await page.keyboard.press("Shift");
    await page.locator('[data-testid="live-controls"]:not([data-faded])').waitFor();
  });

  await step("controls left out: no transpose, no structure bar; the rest still there", async () => {
    if ((await page.getByTestId("live-key").evaluate((el) => el.tagName)) !== "SPAN") throw new Error("the key still transposes");
    if (await page.getByTestId("live-structure").count()) throw new Error("the structure bar is shown");
    await controls().getByRole("button", { name: "Bigger text" }).waitFor();
    await controls().getByRole("button", { name: "Start scrolling" }).waitFor();
  });

  await step("the next song from the floating buttons", async () => {
    await controls().getByTestId("live-next").click();
    await page.waitForURL(new RegExp(ids[1]));
    await page.getByTestId("live-controls").waitFor();
  });

  await step("hidden: nothing over the chart; the keys still work; a tap at the bottom brings them up", async () => {
    await openControls();
    await panel().getByTestId("display-controls-hidden").click();
    await page.getByTestId("display-close").click();
    await panel().waitFor({ state: "detached" });
    await page.getByTestId("live-controls").waitFor({ state: "detached" });
    await page.keyboard.press("ArrowLeft");
    await page.waitForURL(new RegExp(ids[0]));
    await page.getByTestId("live-controls-reveal").click();
    await controls().getByTestId("live-next").click();
    await page.waitForURL(new RegExp(ids[1]));
    await page.getByTestId("live-controls").waitFor({ state: "detached", timeout: 8000 });
    await saved((found) => found.LIVE?.controls === "hidden");
  });

  await step("over a reload, the same", async () => {
    await page.reload();
    await page.getByTestId("live-view").waitFor();
    await page.getByTestId("live-controls-reveal").waitFor({ state: "attached" });
    if (await page.getByTestId("live-controls").count()) throw new Error("controls shown");
  });
} finally {
  await browser.close();
}
finish();
