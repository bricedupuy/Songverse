// The Library's home (issue #81), in the browser: shelves of cards above
// the list - newly added, recently viewed, favorites (once there are
// some), popular in your teams - each card with a cover of its own when
// the song has no image; the star on a song's page; the favorites filter;
// the shelves stepping aside for a search.
import { chromium } from "playwright";
import { WEB, api, finish, signIn, sql, stamp, stepper, user } from "../lib/harness.mjs";

let page;
const step = stepper(() => page);
const me = await user("Home");
const mate = await user("Mate");
const team = await api(me, "POST", "/teams", { name: `Home band ${stamp}` });
sql(`insert into "TeamMembership" (id, "teamId", "userId", role, "updatedAt") values ('tmw${stamp}', '${team.id}', '${mate.id}', 'MEMBER', now())`);
const older = await api(me, "POST", "/song-versions", { title: `Zephyr hymn ${stamp}`, language: "en", artists: ["Someone"], teamId: team.id });
const newer = await api(me, "POST", "/song-versions", { title: `Yonder song ${stamp}`, language: "en", artists: ["Someone Else"] });
const set = await api(me, "POST", "/setlists", { name: `Home set ${stamp}`, teamId: team.id });
await api(me, "POST", `/setlists/${set.id}/items`, { songVersionId: older.id });

const browser = await chromium.launch();
page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
await signIn(page, me);
const shelf = (id) => page.getByTestId(`shelf-${id}`);
const card = (id, title) => shelf(id).getByTestId("song-card").filter({ hasText: title });

await step("Library opens on its home: newly added first, with covers; popular in the team", async () => {
  await page.goto(`${WEB}/library`);
  await page.waitForLoadState("networkidle");
  const titles = await shelf("newest").getByTestId("song-card").allInnerTexts();
  if (!titles[0]?.includes(`Yonder song ${stamp}`)) throw new Error(titles.slice(0, 2).join(" | "));
  // No image yet: a cover with its initials.
  if ((await card("newest", `Yonder song ${stamp}`).getByTestId("song-cover").innerText()).trim() !== "YS") throw new Error("no cover");
  await card("popular", `Zephyr hymn ${stamp}`).waitFor();
  if (await shelf("favorites").count()) throw new Error("an empty favorites shelf");
  await page.getByRole("heading", { name: "All songs" }).waitFor();
});

await step("a song opened is recently viewed; starred, it's a favorite", async () => {
  await card("newest", `Zephyr hymn ${stamp}`).click();
  await page.waitForURL(`${WEB}/library/${older.id}`);
  const star = page.getByRole("button", { name: "Add to favorites" });
  await star.click();
  await page.getByRole("button", { name: "Remove from favorites" }).waitFor();
  await page.goto(`${WEB}/library`);
  await page.waitForLoadState("networkidle");
  await card("recent", `Zephyr hymn ${stamp}`).waitFor();
  await card("favorites", `Zephyr hymn ${stamp}`).waitFor();
});

await step("See all favorites: the list, filtered, without the shelves", async () => {
  await shelf("favorites").getByRole("link", { name: "See all" }).click();
  await page.waitForURL(/favorites=true/);
  await page.getByTestId("library-range").getByText("1–1 of 1").waitFor();
  if (await page.getByTestId("library-home").count()) throw new Error("the shelves still show");
  await page.getByRole("button", { name: "Favorites", pressed: true }).click();
  await page.waitForURL(`${WEB}/library`);
  await page.getByTestId("library-home").waitFor();
});

await step("a search steps the shelves aside", async () => {
  await page.getByRole("searchbox").fill(`Yonder song ${stamp}`);
  await page.waitForURL(/q=/);
  await page.getByTestId("library-home").waitFor({ state: "detached" });
  await page.getByTestId("library-range").getByText("1–1 of 1").waitFor();
});

await step("unstarred, the favorites shelf goes", async () => {
  await page.goto(`${WEB}/library/${older.id}`);
  await page.getByRole("button", { name: "Remove from favorites" }).click();
  await page.getByRole("button", { name: "Add to favorites" }).waitFor();
  await page.goto(`${WEB}/library`);
  await page.waitForLoadState("networkidle");
  await shelf("recent").waitFor();
  if (await shelf("favorites").count()) throw new Error("still a favorite");
});

await browser.close();
finish();
