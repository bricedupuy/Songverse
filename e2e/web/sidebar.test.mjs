// The nested sidebar (issue #80, after shadcn's sidebar-09): a rail of
// sections and a panel listing what's in the one you're in - songs, sets,
// songbooks - to go from one to the next, and in a set its songs; filtering
// it; collapsing it to the rail (remembered), and a rail icon opening it again.
import { chromium } from "playwright";
import { WEB, api, finish, railLink, signIn, stamp, stepper, user } from "../lib/harness.mjs";

let page;
const step = stepper(() => page);
const me = await user("Sidebar");
const first = await api(me, "POST", "/song-versions", { title: `Aardvark hymn ${stamp}`, language: "en", artists: ["Someone"] });
const second = await api(me, "POST", "/song-versions", { title: `Aardvark psalm ${stamp}`, language: "en", artists: ["Someone Else"] });
const set = await api(me, "POST", "/setlists", { name: `Sidebar set ${stamp}` });
await api(me, "POST", "/setlists", { name: `Other set ${stamp}` });
for (const song of [first, second]) await api(me, "POST", `/setlists/${set.id}/items`, { songVersionId: song.id });
const { items } = await api(me, "GET", `/setlists/${set.id}`);

const browser = await chromium.launch();
page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
await signIn(page, me);
const panel = () => page.getByTestId("sidebar-panel");
const state = () => page.locator('[data-slot="sidebar"]').getAttribute("data-state");
const until = (want) => page.waitForFunction((w) => document.querySelector('[data-slot="sidebar"]')?.getAttribute("data-state") === w, want);

await step("the library's panel lists its songs; one opens, and is marked", async () => {
  await page.goto(`${WEB}/library`);
  await page.waitForLoadState("networkidle");
  if ((await state()) !== "expanded") throw new Error(await state());
  if ((await railLink(page, "Library").getAttribute("data-active")) !== "true") throw new Error("Library isn't marked");
  await panel().getByLabel("Filter…").fill(`Aardvark`);
  await panel().getByRole("link", { name: `Aardvark psalm ${stamp}` }).waitFor();
  await panel().getByRole("link", { name: `Aardvark hymn ${stamp}` }).click();
  await page.waitForURL(`${WEB}/library/${first.id}`);
  if ((await panel().getByRole("link", { name: `Aardvark hymn ${stamp}` }).getAttribute("aria-current")) !== "page") throw new Error("not marked");
});

await step("the next song is one click away", async () => {
  await panel().getByRole("link", { name: `Aardvark psalm ${stamp}` }).click();
  await page.waitForURL(`${WEB}/library/${second.id}`);
  await page.getByRole("heading", { name: `Aardvark psalm ${stamp}` }).first().waitFor();
});

await step("Sets on the rail: the panel lists the sets, filtered as you type", async () => {
  await railLink(page, "Sets").click();
  await page.waitForURL(`${WEB}/sets`);
  await panel().getByTestId("sidebar-panel-title").getByText("Sets", { exact: true }).waitFor();
  await panel().getByLabel("Filter…").fill("sidebar set");
  await panel().getByRole("link", { name: new RegExp(`Sidebar set ${stamp}`) }).waitFor();
  if (await panel().getByRole("link", { name: new RegExp(`Other set ${stamp}`) }).count()) throw new Error("not filtered");
  await panel().getByRole("link", { name: new RegExp(`Sidebar set ${stamp}`) }).click();
  await page.waitForURL(`${WEB}/sets/${set.id}`);
});

await step("in a set, the panel lists its songs; one opens, and is marked; back to the sets", async () => {
  await panel().getByRole("link", { name: new RegExp(`^Sidebar set ${stamp}`) }).waitFor();
  const songs = panel().getByTestId("sidebar-panel-list");
  await songs.getByRole("link", { name: `1. Aardvark hymn ${stamp}` }).waitFor();
  await songs.getByRole("link", { name: `2. Aardvark psalm ${stamp}` }).click();
  await page.waitForURL(`${WEB}/sets/${set.id}/songs/${items[1].id}`);
  if ((await songs.getByRole("link", { name: `2. Aardvark psalm ${stamp}` }).getAttribute("aria-current")) !== "page") throw new Error("not marked");
  await songs.getByRole("link", { name: `1. Aardvark hymn ${stamp}` }).click();
  await page.waitForURL(`${WEB}/sets/${set.id}/songs/${items[0].id}`);
  // Back lists the sets again, without leaving the song.
  await panel().getByTestId("sidebar-panel-back").click();
  await panel().getByLabel("Filter…").fill(""); // still what was typed before
  await panel().getByRole("link", { name: new RegExp(`Other set ${stamp}`) }).waitFor();
  if (!page.url().endsWith(`/songs/${items[0].id}`)) throw new Error(page.url());
  await panel().getByRole("link", { name: new RegExp(`Sidebar set ${stamp}`) }).click();
  await page.waitForURL(`${WEB}/sets/${set.id}`);
  await panel().getByTestId("sidebar-panel-list").getByRole("link", { name: `1. Aardvark hymn ${stamp}` }).waitFor();
});

await step("collapsed to the rail, remembered; a rail icon opens it again", async () => {
  await page.keyboard.press("Control+b");
  await until("collapsed");
  // The panel's container closes to nothing; the rail stays.
  await page.waitForFunction(() => document.querySelector('[data-testid="sidebar-panel"]').parentElement.getBoundingClientRect().width < 1);
  await railLink(page, "Library").waitFor();
  await page.reload();
  await page.waitForLoadState("networkidle");
  await until("collapsed");
  await railLink(page, "Songbooks").click();
  await page.waitForURL(`${WEB}/songbooks`);
  await until("expanded");
  await panel().getByTestId("sidebar-panel-title").getByText("Songbooks", { exact: true }).waitFor();
  await page.locator('[data-slot="sidebar-rail"]').click();
  await until("collapsed");
  await page.getByRole("button", { name: "Toggle Sidebar" }).click();
  await until("expanded");
});

await browser.close();
finish();
