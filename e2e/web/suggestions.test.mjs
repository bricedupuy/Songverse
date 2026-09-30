// Suggesting a change to a catalogue song in the browser (issue #74): the
// song editor opens for a suggestion, which the reviewer reads as a
// before/after and accepts; the suggester sees what became of it.
import { chromium } from "playwright";
import { WEB, api, finish, signIn, sql, giveRole, stamp, stepper, user } from "../lib/harness.mjs";

let page;
const step = stepper(() => page);
const admin = await user("Sugg web admin");
sql(`update "User" set "isGlobalAdmin"=true where id='${admin.id}'`);
const reviewer = await user("Sugg web reviewer");
giveRole(reviewer.id, "REVIEWER");
const alice = await user("Sugg web alice");
const title = `Catalogue ${stamp}`;
const song = await api(admin, "POST", "/song-versions", { title, language: "en", artists: ["Band"], content: "{start_of_verse}\n[G]Old line\n{end_of_verse}\n" });
await api(admin, "POST", `/song-versions/${song.id}/publish`, {});

const browser = await chromium.launch();
page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
await signIn(page, alice);

await step("a catalogue song can't be edited, but a change can be suggested", async () => {
  await page.goto(`${WEB}/library/${song.id}`);
  await page.getByText("You can suggest a change.").waitFor();
  if (await page.getByLabel("Song name").isEditable()) throw new Error("editable before suggesting");
  await page.getByRole("button", { name: "Suggest a change" }).click();
  await page.getByText("The song isn't changed until a reviewer accepts it.").waitFor();
  await page.getByLabel("Song name").fill(`${title} (live)`);
});

await step("sent with a message; the song itself is unchanged", async () => {
  await page.getByRole("button", { name: "Send suggestion" }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("What does it change, and why? (optional)").fill("That's how we sing it");
  await dialog.getByRole("button", { name: "Send suggestion" }).click();
  await page.getByText("Suggestion sent.").waitFor();
  await page.getByRole("heading", { name: title, exact: true }).waitFor();
  if ((await page.getByLabel("Song name").inputValue()) !== title) throw new Error("the form kept the suggestion");
  await page.getByTestId("my-suggestions").getByText("Waiting for review").waitFor();
});

await step("the reviewer reads it as a before/after and accepts it", async () => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  page = await context.newPage();
  await signIn(page, reviewer);
  await page.goto(`${WEB}/review`);
  await page.getByTestId("suggestion-queue").getByRole("link").filter({ hasText: title }).click();
  await page.waitForURL(/\/review\/suggestions\//);
  await page.getByText("That's how we sing it").waitFor();
  const changes = page.getByTestId("suggestion-changes");
  await changes.locator("del", { hasText: title }).waitFor();
  await changes.locator("ins", { hasText: `${title} (live)` }).waitFor();
  await page.getByRole("button", { name: "Accept" }).click();
  await page.getByText("Accepted").first().waitFor();
  const updated = await api(alice, "GET", `/song-versions/${song.id}`);
  if (updated.title !== `${title} (live)`) throw new Error(updated.title);
  await context.close();
});

await step("the suggester sees it accepted, and it's in the song's history in their name", async () => {
  page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await signIn(page, alice);
  await page.goto(`${WEB}/library/${song.id}`);
  await page.getByTestId("my-suggestions").getByText("Accepted").waitFor();
  await page.goto(`${WEB}/library/${song.id}?tab=history`);
  await page.getByTestId("history-list").getByRole("button").first().getByText("Sugg web alice").waitFor();
});

await browser.close();
finish();
