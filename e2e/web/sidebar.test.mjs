// The sidebar collapses to its icons on one item's page - a song, a set, a
// songbook - and is open on lists (issue #80). Collapsed, a group's icon
// opens its list as a menu. What the user chooses is remembered, apart for
// lists and for items, across page changes and reloads.
import { chromium } from "playwright";
import { WEB, api, finish, signIn, stamp, stepper, user } from "../lib/harness.mjs";

let page;
const step = stepper(() => page);
const me = await user("Sidebar");
const song = await api(me, "POST", "/song-versions", { title: `Sidebar song ${stamp}`, language: "en", artists: ["Someone"] });
const other = await api(me, "POST", "/song-versions", { title: `Other song ${stamp}`, language: "en", artists: ["Someone"] });
const set = await api(me, "POST", "/setlists", { name: `Sidebar set ${stamp}` });

const browser = await chromium.launch();
page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
await signIn(page, me);
const sidebar = () => page.locator('[data-slot="sidebar"]');
const expect = async (state) => {
  await page.waitForFunction((want) => document.querySelector('[data-slot="sidebar"]')?.getAttribute("data-state") === want, state);
};
const open = async (path) => {
  await page.goto(`${WEB}${path}`);
  await page.waitForLoadState("networkidle");
};

await step("open on a list, collapsed to icons on a song", async () => {
  await open("/library");
  await expect("expanded");
  await sidebar().getByText("Songs", { exact: true }).waitFor();
  await open(`/library/${song.id}`);
  await expect("collapsed");
  if (await sidebar().getByText("Songs", { exact: true }).count()) throw new Error("the sub-list still shows");
});

await step("collapsed, an icon opens its list as a menu", async () => {
  await sidebar().getByRole("button", { name: "Sets" }).click();
  const menu = page.getByRole("menu");
  await menu.getByRole("menuitem", { name: "Sets" }).waitFor();
  await menu.getByRole("menuitem", { name: `Sidebar set ${stamp}` }).click();
  await page.waitForURL(`${WEB}/sets/${set.id}`);
  await expect("collapsed");
});

await step("expanded on an item page, it stays so on other items; lists keep their own", async () => {
  await page.locator('[data-slot="sidebar-rail"]').click();
  await expect("expanded");
  await open(`/library/${other.id}`);
  await expect("expanded");
  await open("/sets");
  await expect("expanded");
  await page.keyboard.press("Control+b");
  await expect("collapsed");
  await open("/songbooks");
  await expect("collapsed");
  await open(`/library/${song.id}`);
  await expect("expanded");
});

await step("remembered after a reload; back to the defaults once changed back", async () => {
  await page.reload();
  await page.waitForLoadState("networkidle");
  await expect("expanded");
  await page.getByRole("button", { name: "Toggle Sidebar" }).click();
  await expect("collapsed");
  await open("/library");
  await expect("collapsed");
  await page.keyboard.press("Control+b");
  await expect("expanded");
  await open("/library/new");
  await expect("expanded");
});

await browser.close();
finish();
