// The song's History tab (issue #71): each save with who and what it
// changed; an older one restored, which shows in the history; Restore off
// while the editor has unsaved changes, and not there for a read-only song.
import { chromium } from "playwright";
import { WEB, api, finish, signIn, sql, stamp, stepper, user } from "../lib/harness.mjs";

let page;
const step = stepper(() => page);
const me = await user("Historian");
const member = await user("Bandmate");
const chart = (words) => `{start_of_verse}\n[G]${words}\n{end_of_verse}\n`;
const earlier = (songId) =>
  sql(`update "SongVersionRevision" set "createdAt" = "createdAt" - interval '1 hour', "updatedAt" = "updatedAt" - interval '1 hour' where "songVersionId" = '${songId}'`);

const team = await api(me, "POST", "/teams", { name: `History team ${stamp}` });
sql(`insert into "TeamMembership" (id, "teamId", "userId", role, "updatedAt") values ('tmw${stamp}', '${team.id}', '${member.id}', 'MEMBER', now())`);
const song = await api(me, "POST", "/song-versions", {
  title: `Before ${stamp}`,
  language: "en",
  artists: ["Someone"],
  key: "G",
  content: chart("Old words here"),
  contentFormat: "CHORDPRO",
  teamId: team.id,
});
earlier(song.id);
await api(me, "PATCH", `/song-versions/${song.id}`, { title: `After ${stamp}`, key: "A", content: chart("New words here") });

const browser = await chromium.launch();
page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
await signIn(page, me);
const list = () => page.getByTestId("history-list");
const entry = () => page.getByTestId("history-entry");

await step("History: each save, newest first, with who; the latest open, showing what it changed", async () => {
  await page.goto(`${WEB}/library/${song.id}?tab=history`);
  await list().getByRole("button").nth(1).waitFor();
  const rows = await list().getByRole("button").allInnerTexts();
  if (rows.length !== 2 || !rows[0].includes("Changed the chart and details") || !rows[0].includes("Current") || !rows[0].includes("Historian") || !rows[1].includes("Created")) {
    throw new Error(JSON.stringify(rows));
  }
  const details = entry().getByTestId("history-details");
  await details.getByText(`Before ${stamp}`).waitFor();
  await details.getByText(`After ${stamp}`).waitFor();
  if ((await details.locator("del").allInnerTexts()).join() !== `Before ${stamp},G`) throw new Error(await details.innerText());
  const diff = entry().getByTestId("history-chart-diff");
  await diff.locator('[data-kind="removed"]').getByText("Old words here").waitFor();
  await diff.locator('[data-kind="added"]').getByText("New words here").waitFor();
  // The latest is the song as it is: nothing to restore.
  if (await entry().getByRole("button", { name: "Restore this version" }).count()) throw new Error("Restore on the current entry");
});

await step("the first save, and the whole song as it was", async () => {
  await list().getByRole("button", { name: /Created/ }).click();
  await entry().getByTestId("history-snapshot").getByText(`Before ${stamp}`).waitFor();
  await entry().getByTestId("history-snapshot").getByText("Old words here").waitFor();
});

await step("Restore is off while the song has unsaved changes", async () => {
  await page.getByRole("tab", { name: "Song info" }).click();
  await page.getByLabel("Song name").fill(`Unsaved ${stamp}`);
  await page.getByRole("tab", { name: "History" }).click();
  await list().getByRole("button", { name: /Created/ }).click();
  const restore = entry().getByRole("button", { name: "Restore this version" });
  if (await restore.isEnabled()) throw new Error("Restore with unsaved changes");
  await entry().getByText("Save or discard your changes first.").waitFor();
  await page.getByRole("button", { name: "Discard changes" }).click();
  await restore.waitFor({ state: "attached" });
  await page.waitForFunction(() => !document.querySelector('[data-testid="history-entry"] button[disabled]'));
});

await step("restored: the song as it was, and a new entry naming it", async () => {
  await entry().getByRole("button", { name: "Restore this version" }).click();
  await list().getByRole("button", { name: /Restored the version of/ }).waitFor();
  const rows = await list().getByRole("button").allInnerTexts();
  if (rows.length !== 3 || !rows[0].includes("Current")) throw new Error(JSON.stringify(rows));
  await page.getByRole("heading", { name: `Before ${stamp}` }).waitFor();
  const current = await api(me, "GET", `/song-versions/${song.id}`);
  if (current.documentJson.defaults.key !== "G" || current.documentJson.sections[0].lines[0].text !== "Old words here") throw new Error(JSON.stringify(current.documentJson));
});

await step("a team member sees the history but can't restore", async () => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const other = await context.newPage();
  await signIn(other, member);
  await other.goto(`${WEB}/library/${song.id}?tab=history`);
  await other.getByTestId("history-list").getByRole("button").nth(2).waitFor();
  await other.getByTestId("history-list").getByRole("button", { name: /Created/ }).click();
  await other.getByTestId("history-snapshot").waitFor();
  if (await other.getByRole("button", { name: "Restore this version" }).count()) throw new Error("Restore for a read-only song");
  await context.close();
});

await browser.close();
finish();
