// Things that can't be undone ask first: a first click shows "Confirm" and
// "Cancel", and only "Confirm" goes ahead.
import { chromium } from "playwright";
import { WEB, api, call, finish, signIn, stamp, stepper, user } from "../lib/harness.mjs";

let page;
const step = stepper(() => page);
const owner = await user("Confirm owner");
const member = await user("Confirm member");

const songbook = await api(owner, "POST", "/songbooks", { name: `Confirm book ${stamp}`, kind: "SIMPLE" });
const team = await api(owner, "POST", "/teams", { name: `Confirm team ${stamp}` });
const link = await api(owner, "POST", `/teams/${team.id}/invite-links`, { role: "MEMBER" });
await api(member, "POST", `/teams/join/${link.token}`);

const browser = await chromium.launch();
page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
await signIn(page, owner);

await step("cancel keeps the songbook; confirm deletes it", async () => {
  await page.goto(`${WEB}/songbooks/${songbook.id}`);
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Delete songbook" }).click();
  await page.getByRole("button", { name: "Cancel" }).click();
  await page.getByRole("button", { name: "Delete songbook" }).click();
  await page.getByRole("button", { name: "Confirm delete" }).click();
  await page.waitForURL((url) => !url.pathname.includes(songbook.id));
  const { status } = await call(owner, "GET", `/songbooks/${songbook.id}`);
  if (status !== 404) throw new Error(`songbook still there (${status})`);
});

await step("a member leaves a team after confirming", async () => {
  const other = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await signIn(other, member);
  await other.goto(`${WEB}/teams/${team.id}`);
  await other.waitForLoadState("networkidle");
  await other.getByRole("button", { name: "Leave team" }).click();
  await other.getByRole("button", { name: "Confirm leave" }).click();
  await other.waitForURL("**/dashboard");
  const members = await api(owner, "GET", `/teams/${team.id}/members`);
  if (members.some((m) => m.userId === member.id)) throw new Error("still a member");
  await other.close();
});

await step("the team admin deletes the team after confirming", async () => {
  await page.goto(`${WEB}/teams/${team.id}`);
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Delete team" }).click();
  await page.getByRole("button", { name: "Confirm delete" }).click();
  await page.waitForURL(`${WEB}/teams`);
  const { status } = await call(owner, "GET", `/teams/${team.id}`);
  if (status !== 404 && status !== 403) throw new Error(`team still there (${status})`);
});

await browser.close();
finish();
