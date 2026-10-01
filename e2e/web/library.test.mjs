// The Library page: search, sorting and paging done by the server; the dashboard's counts.
import { chromium } from "playwright";
import { WEB, api, finish, signIn, stamp, stepper, user } from "../lib/harness.mjs";

let page;
const step = stepper(() => page);
const me = await user("Librarian");
for (let i = 1; i <= 55; i++) {
  await api(me, "POST", "/song-versions", { title: `Shelf ${stamp} ${String(i).padStart(2, "0")}`, language: "en", artists: ["Test Artist"] });
}
await api(me, "POST", "/song-versions", { title: `Zephyr ${stamp}`, language: "en", artists: ["Unique Singer"], versionName: "Live" });
const band = await api(me, "POST", "/teams", { name: `Shelf band ${stamp}` });
await api(me, "POST", "/song-versions", { title: `Band song ${stamp}`, language: "en", artists: ["Test Artist"], teamId: band.id });

const browser = await chromium.launch();
page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await signIn(page, me);
const range = () => page.getByTestId("library-range").innerText();
const rangeIs = (text) =>
  page.waitForFunction((t) => document.querySelector('[data-testid="library-range"]')?.textContent === t, text, { timeout: 10000 });

await step("more songs as it scrolls, appended; the address follows, and a reload brings them all back (issue #150)", async () => {
  await page.goto(`${WEB}/library/songs`);
  await page.waitForLoadState("networkidle");
  const text = await range();
  if (!/^1–50 of \d+$/.test(text)) throw new Error(text);
  const total = Number(text.split(" of ")[1]);
  const second = `1–${Math.min(100, total)} of ${total}`;
  // Scrolled to the end: the next 50 come, under the first.
  await page.getByTestId("library-range").scrollIntoViewIfNeeded();
  // (It goes on loading while the end is in view.)
  const shown = () => page.locator("tbody tr").count();
  await page.waitForFunction((want) => document.querySelectorAll("tbody tr").length >= want, Math.min(100, total));
  await page.waitForURL(/page=\d+/);
  const pageReached = Number(new URL(page.url()).searchParams.get("page"));
  const before = await shown();
  await page.reload();
  await page.waitForLoadState("networkidle");
  // Reloaded: every page up to the one reached.
  if ((await shown()) < Math.min(pageReached * 50, total, 500) - 1) throw new Error(`${await shown()} rows after reload, ${before} before (page ${pageReached})`);
  void second;
});

await step("Title, Artist and Tags to start with (issue #168); columns shown or hidden, and moved, remembered (issue #150)", async () => {
  const headers = () => page.locator("thead th").allInnerTexts().then((texts) => texts.map((text) => text.trim()));
  const headersAre = (expected) =>
    page.waitForFunction((want) => [...document.querySelectorAll("thead th")].map((th) => th.textContent.trim()).join("|") === want, expected, { timeout: 5000 }).catch(async () => {
      throw new Error(`${(await headers()).join("|")}, not ${expected}`);
    });
  await headersAre("Title|Artist|Tags");
  await page.getByTestId("library-columns").click();
  const list = page.getByTestId("library-columns-list");
  await list.locator('[data-column="language"]').getByRole("checkbox").check();
  await list.locator('[data-column="publicationState"]').getByRole("checkbox").check();
  await list.locator('[data-column="createdAt"]').getByRole("checkbox").check();
  await list.locator('[data-column="tags"]').getByRole("checkbox").uncheck();
  await list.getByRole("button", { name: "Move Status earlier" }).click();
  await page.keyboard.press("Escape");
  await headersAre("Title|Artist|Status|Language|Added");
  await page.reload();
  await page.waitForLoadState("networkidle");
  await headersAre("Title|Artist|Status|Language|Added");
  // Back as they were, then the Status column, for the steps after.
  await page.evaluate(() => localStorage.removeItem("songverse.library.columns"));
  await page.goto(`${WEB}/library/songs`);
  await page.waitForLoadState("networkidle");
  await headersAre("Title|Artist|Tags");
  await page.getByTestId("library-columns").click();
  await list.locator('[data-column="publicationState"]').getByRole("checkbox").check();
  await page.keyboard.press("Escape");
  await headersAre("Title|Artist|Tags|Status");
});

await step("search finds songs beyond the first page, by title or artist", async () => {
  await page.getByRole("searchbox").fill(`Shelf ${stamp} 5`);
  await page.waitForURL(/q=/);
  await rangeIs("1–6 of 6");
  if (/page=/.test(page.url())) throw new Error("a new search should start at page 1");
  await page.getByRole("searchbox").fill("unique singer");
  await page.getByText(`Zephyr ${stamp}`).waitFor();
  await page.getByText("— Live").waitFor();
});

await step("sorting by title is done across all songs", async () => {
  await page.getByRole("searchbox").fill(`Shelf ${stamp}`);
  await rangeIs("1–50 of 55");
  await page.getByRole("button", { name: "Title" }).click();
  await page.waitForURL(/sort=title/);
  await page.getByRole("button", { name: "Title" }).click();
  await page.waitForURL(/dir=desc/);
  await page.waitForFunction((s) => document.querySelector("tbody tr td")?.textContent?.includes(`Shelf ${s} 55`), stamp);
});

await step("the Status column reads as words: a song never offered is Personal, or Team", async () => {
  const status = async (title) => (await page.locator("tbody tr").filter({ hasText: title }).locator("td").nth(3).innerText()).trim();
  await page.getByRole("searchbox").fill(`Zephyr ${stamp}`);
  await rangeIs("1–1 of 1");
  if ((await status(`Zephyr ${stamp}`)) !== "Personal") throw new Error(await status(`Zephyr ${stamp}`));
  await page.getByRole("searchbox").fill(`Band song ${stamp}`);
  await rangeIs("1–1 of 1");
  if ((await status(`Band song ${stamp}`)) !== "Team") throw new Error(await status(`Band song ${stamp}`));
});

await step("no matches says so", async () => {
  await page.getByRole("searchbox").fill(`nothing-like-this-${stamp}`);
  await page.getByText("No songs match your search.").waitFor();
});

await step("the dashboard counts every song, not just a page", async () => {
  await page.goto(`${WEB}/dashboard`);
  await page.waitForLoadState("networkidle");
  const stats = await api(me, "GET", "/song-versions/stats");
  if (stats.songCount < 56) throw new Error(JSON.stringify(stats));
  await page.getByText(String(stats.songCount), { exact: true }).first().waitFor();
});

await step("no page errors", async () => {
  if (errors.length) throw new Error(errors.join(" | "));
});

await browser.close();
finish();
