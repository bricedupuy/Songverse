// Page changes reuse the signed-in session and sidebar lists instead of
// refetching them every time, and still pick up changes made in the app.
import { chromium } from "playwright";
import { API, WEB, api, finish, signIn, sql, stamp, stepper, user } from "../lib/harness.mjs";

let page;
const step = stepper(() => page);
const me = await user("Navigator");
const navSet = await api(me, "POST", "/setlists", { name: `Nav set ${stamp}` });
const navSong = await api(me, "POST", "/song-versions", { title: `Nav song ${stamp}`, language: "en", artists: ["Someone"] });
const [navItem] = (await api(me, "POST", `/setlists/${navSet.id}/items`, { songVersionId: navSong.id })).items;
const navBook = await api(me, "POST", "/songbooks", { name: `Nav book ${stamp}`, kind: "NUMBERED" });

const browser = await chromium.launch();
page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
await signIn(page, me);
await page.goto(`${WEB}/library`);
await page.waitForLoadState("networkidle");

const requests = [];
page.on("request", (r) => requests.push(r.url()));
const go = async (href) => {
  await page.locator(`a[href="${href}"]`).first().click();
  await page.waitForURL(`${WEB}${href}`);
  await page.waitForLoadState("networkidle");
};

await step("changing pages doesn't refetch the session and sidebar every time", async () => {
  for (const href of ["/sets", "/library", "/songbooks", "/library", "/sets"]) await go(href);
  const sidebarLists = requests.filter((u) => /^\S+\/(teams|songbooks|setlists)$/.test(u.replace(API, "API"))).length;
  const pageLists = 3; // /sets twice and /songbooks once load their own list
  // At most one reload of the three sidebar lists, on top of the pages' own.
  if (sidebarLists > pageLists + 3) throw new Error(`${sidebarLists} list requests: ${requests.filter((u) => u.startsWith(API)).join(" ")}`);
});

await step("a set created in the app shows in the sidebar straight away", async () => {
  await go("/sets/new");
  await page.fill("#set-name", `Fresh set ${stamp}`);
  await page.getByRole("button", { name: /Create/ }).click();
  await page.waitForURL(/\/sets\/(?!new)[a-z0-9]+/);
  // The page's own heading has the name too; the sidebar's entry is a link to the set.
  await page.getByRole("link", { name: `Fresh set ${stamp}` }).first().waitFor({ timeout: 10000 });
});

await step("the breadcrumb names where you are, not always Library", async () => {
  const crumbs = async () => (await page.getByRole("navigation", { name: "breadcrumb" }).innerText()).split("\n").map((c) => c.trim()).filter(Boolean);
  const expect = async (url, want) => {
    await page.goto(`${WEB}${url}`);
    await page.waitForLoadState("networkidle");
    const got = await crumbs();
    if (got.join(" > ") !== want.join(" > ")) throw new Error(`on ${url}: ${got.join(" > ")}`);
  };
  await expect(`/sets/${navSet.id}`, ["Sets", `Nav set ${stamp}`]);
  await expect(`/sets/${navSet.id}/songs/${navItem.id}`, ["Sets", `Nav set ${stamp}`, `Nav song ${stamp}`]);
  await expect(`/songbooks/${navBook.id}`, ["Songbooks", `Nav book ${stamp}`]);
  await expect("/sets/new", ["Sets", "New"]);
  await expect("/teams/new", ["Teams", "New"]);
  // The set's crumb goes back to it.
  await page.goto(`${WEB}/sets/${navSet.id}/songs/${navItem.id}`);
  await page.getByRole("navigation", { name: "breadcrumb" }).getByRole("link", { name: `Nav set ${stamp}` }).click();
  await page.waitForURL(`${WEB}/sets/${navSet.id}`);
});

await step("Help opens the docs page about where you are, in your language", async () => {
  const help = async () => {
    await page.getByRole("button", { name: "Navigator" }).click();
    const href = await page.getByRole("menuitem", { name: /Help|Aide/ }).getAttribute("href");
    await page.keyboard.press("Escape");
    return href;
  };
  await go("/sets");
  if ((await help()) !== "https://docs.songverse.one/sets/") throw new Error(`on /sets: ${await help()}`);
  sql(`update "User" set locale='fr' where id='${me.id}'`);
  await page.goto(`${WEB}/library`);
  await page.waitForLoadState("networkidle");
  if ((await help()) !== "https://docs.songverse.one/fr/library/") throw new Error(`in French, on /library: ${await help()}`);
});

await browser.close();
finish();
