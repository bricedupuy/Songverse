// Metadata providers in the browser (issue #22): Auto detect's matches from
// MusicBrainz, Apple Music and Deezer (stand-ins, lib/fake-providers.mjs),
// the song's first release first; choosing one fills the empty details and,
// once saved, links the song to its sources and brings its Deezer link;
// the admin's providers card.
import { chromium } from "playwright";
import { WEB, api, finish, signIn, sql, stamp, stepper, user } from "../lib/harness.mjs";
import { startFakeProviders } from "../lib/fake-providers.mjs";

const fake = await startFakeProviders();
let page;
const step = stepper(() => page);
const me = await user("Seeker");
sql(`update "User" set "isGlobalAdmin"=true where id='${me.id}'`);
await api(me, "DELETE", "/admin/metadata");
const title = `Oceans ${stamp}`;
const song = await api(me, "POST", "/song-versions", { title, language: "en", artists: ["Hillsong"] });

const browser = await chromium.launch();
page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
await signIn(page, me);

await step("Auto detect: one match per release, the first release first, from all three", async () => {
  await page.goto(`${WEB}/library/${song.id}`);
  await page.getByRole("button", { name: "Find song info" }).click();
  const matches = page.getByTestId("metadata-matches").getByRole("listitem");
  await matches.first().waitFor();
  const first = matches.first();
  await first.getByText("Hillsong · Album 1 · 2013").waitFor();
  await first.getByTestId("match-sources").getByText("MusicBrainz · Apple Music · Deezer").waitFor();
  const second = await matches.nth(1).innerText();
  if (!second.includes("Album 2 · 2016")) throw new Error(`second: ${second}`);
});

await step("chosen: the album and year filled in, and linked once saved", async () => {
  await page.getByTestId("metadata-matches").getByRole("listitem").first().getByRole("button", { name: "Use this" }).click();
  await page.getByText("The link is saved with the song", { exact: false }).waitFor();
  await page.getByRole("button", { name: "Save song" }).click();
  await page.getByText("Saved.", { exact: true }).waitFor();
  for (const name of ["MusicBrainz", "Apple Music", "Deezer"]) await page.getByRole("link", { name, exact: true }).waitFor();
  const linked = await api(me, "GET", `/song-versions/${song.id}/metadata`);
  if (linked?.album !== "Album 1") throw new Error(JSON.stringify(linked));
  const saved = await api(me, "GET", `/song-versions/${song.id}`);
  if (saved.album !== "Album 1" || saved.year !== 2013) throw new Error(`album ${saved.album}, year ${saved.year}`);
});

await step("its Deezer track on Links", async () => {
  await page.getByRole("tab", { name: "Links" }).click();
  await page.getByLabel("Deezer").waitFor();
  const value = await page.getByLabel("Deezer").inputValue();
  if (!value.includes("deezer.com/track/5001")) throw new Error(`Deezer link: ${value}`);
});

await step("the admin's providers: reordered, one off, reverted", async () => {
  await page.goto(`${WEB}/admin/metadata`);
  const card = page.getByTestId("metadata-providers");
  await card.getByText("Currently using: the defaults").waitFor();
  await card.getByRole("button", { name: "Move Deezer up" }).click();
  await card.getByRole("button", { name: "Move Deezer up" }).click();
  await card.getByLabel("Use MusicBrainz").uncheck();
  await card.getByRole("button", { name: "Save configuration" }).click();
  await card.getByText("Currently using: settings saved here.").waitFor();
  const settings = await api(me, "GET", "/admin/metadata");
  const order = settings.providers.map((p) => `${p.key}:${p.enabled}`).join();
  if (order !== "deezer:true,musicbrainz:false,apple_music:true") throw new Error(order);
  await card.getByRole("button", { name: "Revert to environment variables" }).click();
  await card.getByRole("button", { name: "Revert", exact: true }).click();
  await card.getByText("Currently using: the defaults").waitFor();
});

await browser.close();
fake.close();
finish();
