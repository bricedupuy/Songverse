// Who sees a song's files, in the song's Files tab (issue #72): a new file
// is only its uploader's until they share it; a team member sees what's
// shared with the team, and adds files of their own.
import { chromium } from "playwright";
import { WEB, api, finish, signIn, sql, stamp, stepper, user } from "../lib/harness.mjs";

let page;
const step = stepper(() => page);
const owner = await user("Owner");
const member = await user("Member");
const team = await api(owner, "POST", "/teams", { name: `Band ${stamp}` });
sql(`insert into "TeamMembership" (id, "teamId", "userId", role, "updatedAt") values ('tmv${stamp}', '${team.id}', '${member.id}', 'MEMBER', now())`);
const song = await api(owner, "POST", "/song-versions", { title: `Shared files ${stamp}`, language: "en", artists: ["Someone"], teamId: team.id });
const pdf = (name) => ({ name, mimeType: "application/pdf", buffer: Buffer.from(`%PDF-1.4 ${name} ${stamp}`) });

const browser = await chromium.launch();
page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
await signIn(page, owner);
const files = () => page.getByTestId("files-list");

await step("a new file is only its uploader's", async () => {
  await page.goto(`${WEB}/library/${song.id}?tab=files`);
  const forNew = page.getByLabel("Who sees the files you add");
  if ((await forNew.inputValue()) !== "PRIVATE") throw new Error(await forNew.inputValue());
  // The song's editor can show a file to everyone who sees the song.
  await forNew.locator("option", { hasText: "Everyone who can see this song" }).waitFor({ state: "attached" });
  await page.getByTestId("files-input").setInputFiles(pdf("chart.pdf"));
  const who = files().getByLabel("Who sees chart.pdf");
  await who.waitFor();
  if ((await who.inputValue()) !== "PRIVATE") throw new Error(await who.inputValue());
});

await step("shared with the team", async () => {
  await files().getByLabel("Who sees chart.pdf").selectOption(`TEAM:${team.id}`);
  await page.waitForFunction(
    (value) => document.querySelector('[aria-label="Who sees chart.pdf"]')?.value === value,
    `TEAM:${team.id}`,
  );
  const [file] = await api(owner, "GET", `/song-versions/${song.id}/attachments`);
  if (file.visibility !== "TEAM" || file.visibleToTeamId !== team.id) throw new Error(JSON.stringify(file));
});

await step("a member sees it, who shared it and with whom, and adds a file of their own", async () => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  page = await context.newPage();
  await signIn(page, member);
  await page.goto(`${WEB}/library/${song.id}?tab=files`);
  await files().getByText(`Shared by Owner with Band ${stamp}`).waitFor();
  if (await files().getByLabel("Who sees chart.pdf").count()) throw new Error("the member can change who sees it");
  if (await files().getByRole("button", { name: "Remove chart.pdf" }).count()) throw new Error("the member can remove it");
  await page.getByText("Files you add here are yours").waitFor();
  const forNew = page.getByLabel("Who sees the files you add");
  if (await forNew.locator("option", { hasText: "Everyone who can see this song" }).count()) throw new Error("a member can show files to everyone");
  await page.getByTestId("files-input").setInputFiles(pdf("my-notes.pdf"));
  await files().getByLabel("Who sees my-notes.pdf").waitFor();
  await files().getByRole("button", { name: "Remove my-notes.pdf" }).waitFor();
  await context.close();
});

await browser.close();
finish();
