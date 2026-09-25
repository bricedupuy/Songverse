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

await step("the library pages through every song", async () => {
  await page.goto(`${WEB}/library`);
  await page.waitForLoadState("networkidle");
  const text = await range();
  if (!/^1–50 of \d+$/.test(text)) throw new Error(text);
  await page.getByRole("button", { name: "Next" }).click();
  await page.waitForURL(/page=2/);
  await page.waitForFunction(() => document.querySelector('[data-testid="library-range"]')?.textContent?.startsWith("51–"));
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
