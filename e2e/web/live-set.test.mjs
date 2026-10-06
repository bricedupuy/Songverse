// A set in Live (issue #199): its songs in the sidebar - the one playing
// marked Now, the ones played quieter and ticked, "Start from the top"
// clearing them - reordered there by their handle, and songs found with
// Ctrl+K added after the one playing or at the end; for who can change the set.
import { chromium } from "playwright";
import { WEB, api, call, check, finish, signIn, stamp, stepper, user } from "../lib/harness.mjs";

let page;
const step = stepper(() => page);
const leader = await user("Set leader");
const guest = await user("Set guest");

const song = (title, key) =>
  api(leader, "POST", "/song-versions", { title: `${title} ${stamp}`, language: "en", artists: ["Band"], key, content: "{start_of_chorus}\n[G]Short [C]song\n{end_of_chorus}\n", contentFormat: "CHORDPRO" });
const [opener, middle, closer, called, encore] = await Promise.all([song("Opener", "G"), song("Middle", "D"), song("Closer", "C"), song("Called", "A"), song("Encore", "E")]);
const set = await api(leader, "POST", "/setlists", { name: `Live set ${stamp}` });
for (const one of [opener, middle, closer]) await api(leader, "POST", `/setlists/${set.id}/items`, { songVersionId: one.id });
const order = async () => (await api(leader, "GET", `/setlists/${set.id}`)).items.map((item) => item.song.title.replace(` ${stamp}`, ""));
const itemOf = async (title) => (await api(leader, "GET", `/setlists/${set.id}`)).items.find((item) => item.song.title === `${title} ${stamp}`).id;

// Through the API: a song right after another.
const openerItem = await itemOf("Opener");
let r = await call(leader, "POST", `/setlists/${set.id}/items`, { songVersionId: encore.id, afterItemId: openerItem });
check("a song added right after another", r.status === 201 && JSON.stringify(await order()) === JSON.stringify(["Opener", "Encore", "Middle", "Closer"]), JSON.stringify(await order()));
r = await call(leader, "POST", `/setlists/${set.id}/items`, { songVersionId: encore.id, afterItemId: "nope" });
check("not after a song that isn't in the set", r.status === 404, String(r.status));
await call(leader, "DELETE", `/setlists/${set.id}/items/${await itemOf("Encore")}`);

const guestSong = await api(guest, "POST", "/song-versions", { title: `Guest song ${stamp}`, language: "en", artists: ["Band"], content: "[G]Mine\n", contentFormat: "CHORDPRO" });
const shared = (await api(leader, "POST", `/setlists/${set.id}/share-link`)).link;
await api(guest, "POST", `/set-invites/${shared.token}/join`);

const browser = await chromium.launch();
try {
  page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await signIn(page, leader);
  const entries = () => page.getByTestId("sidebar-set-song");

  await step("Live's sidebar: the set's songs, the one playing marked Now", async () => {
    await page.goto(`${WEB}/sets/${set.id}/live/${openerItem}`);
    await page.getByTestId("live-view").waitFor();
    await page.waitForLoadState("networkidle");
    await entries().nth(2).waitFor();
    if ((await entries().count()) !== 3) throw new Error(String(await entries().count()));
    if (!(await entries().nth(0).getByTestId("sidebar-now").isVisible())) throw new Error("the song playing isn't marked");
    if (await entries().nth(1).getByTestId("sidebar-now").count()) throw new Error("another marked");
  });

  await step("moved on: the first is ticked as played, the Now mark follows", async () => {
    await page.getByTestId("live-next").click();
    await page.waitForURL(`**/live/${await itemOf("Middle")}`);
    await entries().nth(0).getByTestId("sidebar-played").waitFor();
    await entries().nth(1).getByTestId("sidebar-now").waitFor();
    await page.getByTestId("sidebar-reset-played").getByText("Start from the top").waitFor();
  });

  await step("Ctrl+K: a song called, played next - after the song playing", async () => {
    await page.keyboard.press("Control+k");
    await page.getByRole("combobox").fill(`Called ${stamp}`);
    const row = page.getByRole("option", { name: new RegExp(`Called ${stamp}`) });
    await row.getByTestId("search-play-next").click();
    await page.getByRole("combobox").waitFor({ state: "detached" });
    await page.waitForFunction(() => document.querySelectorAll('[data-testid="sidebar-set-song"]').length === 4);
    const now = JSON.stringify(await order());
    if (now !== JSON.stringify(["Opener", "Middle", "Called", "Closer"])) throw new Error(now);
    await page.getByTestId("live-next").getByText(`Next: Called ${stamp}`).waitFor();
  });

  await step("Ctrl+K: another, at the end of the set", async () => {
    await page.keyboard.press("Control+k");
    await page.getByRole("combobox").fill(`Encore ${stamp}`);
    await page.getByRole("option", { name: new RegExp(`Encore ${stamp}`) }).getByTestId("search-add-end").click();
    await page.waitForFunction(() => document.querySelectorAll('[data-testid="sidebar-set-song"]').length === 5);
    const now = JSON.stringify(await order());
    if (now !== JSON.stringify(["Opener", "Middle", "Called", "Closer", "Encore"])) throw new Error(now);
  });

  await step("reordered by a song's handle (here with the keyboard): saved, and Live's Next follows", async () => {
    // The encore up two places, before the closer and the called one: right after the song playing.
    const handle = entries().nth(4).getByTestId("sidebar-drag-handle");
    await handle.focus();
    await page.keyboard.press("Space");
    await page.waitForTimeout(150);
    await page.keyboard.press("ArrowUp");
    await page.waitForTimeout(150);
    await page.keyboard.press("ArrowUp");
    await page.waitForTimeout(150);
    await page.keyboard.press("Space");
    for (let i = 0; i < 20 && JSON.stringify(await order()) !== JSON.stringify(["Opener", "Middle", "Encore", "Called", "Closer"]); i++) await page.waitForTimeout(250);
    const now = JSON.stringify(await order());
    if (now !== JSON.stringify(["Opener", "Middle", "Encore", "Called", "Closer"])) throw new Error(now);
    await page.getByTestId("live-next").getByText(`Next: Encore ${stamp}`).waitFor();
    if (!(await entries().nth(2).textContent()).includes(`Encore ${stamp}`)) throw new Error(await entries().nth(2).textContent());
  });

  await step("Start from the top: nothing ticked any more", async () => {
    await page.getByTestId("sidebar-reset-played").click();
    await page.getByTestId("sidebar-reset-played").waitFor({ state: "detached" });
    if (await page.getByTestId("sidebar-played").count()) throw new Error("still ticked");
  });

  await step("a guest of the set: no handles, and Ctrl+K only opens songs", async () => {
    const other = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    page = other;
    await signIn(page, guest);
    await page.goto(`${WEB}/sets/${set.id}/live/${openerItem}`);
    await page.getByTestId("live-view").waitFor();
    await page.waitForLoadState("networkidle");
    await page.getByTestId("sidebar-panel-list").waitFor();
    if (await page.getByTestId("sidebar-drag-handle").count()) throw new Error("a guest can move songs");
    await page.keyboard.press("Control+k");
    await page.getByRole("combobox").fill(guestSong.title);
    await page.getByRole("option", { name: new RegExp(guestSong.title) }).waitFor();
    if (await page.getByTestId("search-play-next").count()) throw new Error("a guest can add songs");
  });
} finally {
  await browser.close();
}
finish();
