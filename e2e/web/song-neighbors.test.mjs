// Previous and next on a song's page (issue #84): opened from Songs (as
// searched and sorted) or a songbook, the song's page says where it is in
// that list and goes to the next or previous one, still in it; opened
// otherwise, no bar.
import { chromium } from "playwright";
import { WEB, api, finish, signIn, stamp, stepper, user } from "../lib/harness.mjs";

let page;
const step = stepper(() => page);
const me = await user("Next");
const songs = [];
for (const name of ["Omega A", "Omega B", "Omega C"]) songs.push(await api(me, "POST", "/song-versions", { title: `${name} ${stamp}`, language: "en", artists: ["Someone"] }));
const book = await api(me, "POST", "/songbooks", { name: `Omega book ${stamp}`, kind: "NUMBERED" });
await api(me, "POST", `/songbooks/${book.id}/entries`, { songVersionId: songs[2].id, entryCode: "1" });
await api(me, "POST", `/songbooks/${book.id}/entries`, { songVersionId: songs[0].id, entryCode: "2" });

const browser = await chromium.launch();
page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
await signIn(page, me);
const bar = () => page.getByTestId("song-neighbors");
const position = () => page.getByTestId("song-position").innerText();

await step("opened from Songs as searched and sorted: where it is, and the next one", async () => {
  await page.goto(`${WEB}/library/songs?q=Omega&sort=title&dir=asc`);
  await page.getByTestId("library-range").waitFor();
  await page.getByRole("row").filter({ hasText: `Omega A ${stamp}` }).click();
  await bar().waitFor();
  if ((await position()) !== "1 of 3 · Songs") throw new Error(await position());
  if (await bar().getByRole("link", { name: /^Previous/ }).count()) throw new Error("a previous for the first");
  await bar().getByRole("link", { name: `Next: Omega B ${stamp}` }).click();
  await page.waitForURL(new RegExp(`/library/${songs[1].id}\\?from=`));
  await page.getByRole("heading", { name: `Omega B ${stamp}` }).first().waitFor();
  await page.waitForFunction(() => document.querySelector('[data-testid="song-position"]')?.textContent === "2 of 3 · Songs");
  await bar().getByRole("link", { name: `Previous: Omega A ${stamp}` }).waitFor();
});

await step("opened from a songbook: its order and its name", async () => {
  await page.goto(`${WEB}/library/${songs[2].id}?songbook=${book.id}`);
  await page.waitForFunction(() => document.querySelector('[data-testid="song-position"]')?.textContent?.startsWith("1 of 2"));
  if (!(await position()).endsWith(`Omega book ${stamp}`)) throw new Error(await position());
  await bar().getByRole("link", { name: `Next: 2. Omega A ${stamp}` }).click();
  await page.waitForURL(`${WEB}/library/${songs[0].id}?songbook=${book.id}`);
  await page.waitForFunction(() => document.querySelector('[data-testid="song-position"]')?.textContent?.startsWith("2 of 2"));
});

await step("opened on its own: no bar", async () => {
  await page.goto(`${WEB}/library/${songs[1].id}`);
  await page.getByRole("heading", { name: `Omega B ${stamp}` }).first().waitFor();
  await page.waitForLoadState("networkidle");
  if (await bar().count()) throw new Error("a bar without a list");
});

await browser.close();
finish();
