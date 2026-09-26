// Metadata providers in the browser (issue #22): Auto detect's matches from
// MusicBrainz, Apple Music and Deezer (stand-ins, lib/fake-providers.mjs),
// the song's first release first; choosing one fills the empty details and,
// once saved, links the song to its sources and brings its Deezer link;
// the admin's providers card, and the Apple Music API's key (issue #87).
import { chromium } from "playwright";
import { generateKeyPairSync } from "node:crypto";
import { WEB, api, finish, signIn, sql, stamp, stepper, user } from "../lib/harness.mjs";
import { FAKE_PROVIDERS_URL, appleMusicKey, startFakeProviders } from "../lib/fake-providers.mjs";

const fake = await startFakeProviders();
let page;
const step = stepper(() => page);
const me = await user("Seeker");
sql(`update "User" set "isGlobalAdmin"=true where id='${me.id}'`);
await api(me, "DELETE", "/admin/metadata");
await api(me, "DELETE", "/admin/metadata/apple-music");
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

await step("the Apple Music API's key: saved, tested, reverted", async () => {
  const pair = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  Object.assign(appleMusicKey, { publicKey: pair.publicKey, teamId: "TEAM123456", keyId: "KEY1234567" });
  const card = page.getByTestId("apple-music-key");
  await card.getByText("Currently using: no key - iTunes Search.").waitFor();
  await card.getByLabel("Team ID").fill("TEAM123456");
  await card.getByLabel("Key ID").fill("KEY1234567");
  await card.getByLabel("Private key (.p8)").fill(pair.privateKey.export({ type: "pkcs8", format: "pem" }));
  await card.getByRole("button", { name: "Save configuration" }).click();
  await card.getByText("Currently using: the key saved here (team TEAM123456, key KEY1234567).").waitFor();
  if ((await card.getByLabel("Private key (.p8)").inputValue()) !== "") throw new Error("the private key is still shown");
  await card.getByPlaceholder("Leave blank to keep the current one").waitFor();
  await card.getByRole("button", { name: "Test connection" }).click();
  await card.getByText("The Apple Music API answered", { exact: false }).waitFor();
  await card.getByRole("button", { name: "Revert to environment variables" }).click();
  await card.getByRole("button", { name: "Revert", exact: true }).click();
  await card.getByText("Currently using: no key - iTunes Search.").waitFor();
});

await step("a developer token address, until there's a key", async () => {
  const pair = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  Object.assign(appleMusicKey, { publicKey: pair.publicKey, privateKey: pair.privateKey, teamId: "MINT123456", keyId: "MINTKEY123" });
  const card = page.getByTestId("apple-music-key");
  await card.getByLabel("Developer token URL (without a key)").fill(`${FAKE_PROVIDERS_URL}/applemusic-token`);
  await card.getByRole("button", { name: "Save configuration" }).click();
  await card.getByText(`Currently using: developer tokens from ${FAKE_PROVIDERS_URL}/applemusic-token`, { exact: false }).waitFor();
  await card.getByRole("button", { name: "Test connection" }).click();
  await card.getByText("The Apple Music API answered", { exact: false }).waitFor();
  await card.getByRole("button", { name: "Revert to environment variables" }).click();
  await card.getByRole("button", { name: "Revert", exact: true }).click();
  await card.getByText("Currently using: no key - iTunes Search.").waitFor();
});

await browser.close();
fake.close();
finish();
