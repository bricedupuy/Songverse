// The publish flow in the browser: a user submits a song from its page, a
// reviewer works the queue (changes, approval, merging a duplicate), a
// global admin publishes their own song directly, and Admin > Users grants
// and removes the reviewer role.
import { chromium } from "playwright";
import { WEB, api, call, finish, signIn, sql, stamp, stepper, user } from "../lib/harness.mjs";

let page;
const step = stepper(() => page);
const admin = await user("Pub web admin");
sql(`update "User" set "isGlobalAdmin"=true where id='${admin.id}'`);
const reviewer = await user("Pub web reviewer");
const alice = await user("Pub web alice");
const bob = await user("Pub web bob");

const title = `Web Publish ${stamp}`;
const aliceSong = await api(alice, "POST", "/song-versions", {
  title,
  language: "en",
  artists: ["Alice Band"],
  content: "{start_of_chorus}\n[G]Sing it [D]loud\n{end_of_chorus}",
});
const bobSong = await api(bob, "POST", "/song-versions", { title, language: "en", artists: ["Bob"] });
const adminSong = await api(admin, "POST", "/song-versions", { title: `Admin Web ${stamp}`, language: "en", artists: ["Admin"] });

const browser = await chromium.launch();
const pageFor = async (who) => {
  const p = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await signIn(p, who);
  return p;
};
const alicePage = await pageFor(alice);
const reviewerPage = await pageFor(reviewer);
const openSong = async (p, id) => {
  await p.goto(`${WEB}/library/${id}`);
  await p.waitForLoadState("networkidle");
};
const openSubmission = async (songTitle, submitter, tab = "open") => {
  await reviewerPage.goto(`${WEB}/review${tab === "closed" ? "?tab=closed" : ""}`);
  await reviewerPage.waitForLoadState("networkidle");
  await reviewerPage.getByRole("link").filter({ hasText: songTitle }).filter({ hasText: submitter }).click();
  await reviewerPage.waitForURL(/\/review\/[a-z0-9]+$/);
  await reviewerPage.waitForLoadState("networkidle");
};

await step("admins give someone the Reviewer role in Admin > Users (issue #160)", async () => {
  page = await pageFor(admin);
  await page.goto(`${WEB}/admin/users`);
  await page.waitForLoadState("networkidle");
  await page.getByPlaceholder("Search by name or email…").fill(reviewer.email);
  const row = page.getByRole("row").filter({ hasText: reviewer.email });
  await row.getByRole("button", { name: /Pub web reviewer/ }).click();
  await page.getByRole("menuitem", { name: "Roles…" }).click();
  await page.getByTestId("roles-dialog-list").getByLabel(/Reviewer/).check();
  await page.getByTestId("roles-dialog-save").click();
  await row.getByTestId("user-roles").getByText("Reviewer", { exact: true }).waitFor();
});

await step("a user submits their song from its page", async () => {
  page = alicePage;
  await openSong(page, aliceSong.id);
  await page.getByText("Global catalogue", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Submit for review" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByText("aren't required").waitFor();
  await dialog.getByLabel("Note for the reviewer (optional)").fill("Our Sunday opener");
  await dialog.getByRole("button", { name: "Submit for review" }).click();
  await page.getByText("Waiting for review").waitFor();
  await page.getByRole("button", { name: "Withdraw" }).waitFor();
});

await step("people who aren't reviewers get no Review page", async () => {
  await page.goto(`${WEB}/review`);
  await page.waitForURL("**/dashboard");
  if (await page.getByRole("link", { name: "Review", exact: true }).count()) throw new Error("Review link shown to a non-reviewer");
});

await step("the reviewer sees it in the queue and asks for changes (with a note)", async () => {
  page = reviewerPage;
  await page.goto(`${WEB}/library`);
  await page.getByRole("link", { name: "Review", exact: true }).click();
  await page.waitForURL("**/review");
  await openSubmission(title, "Pub web alice");
  await page.getByText("Our Sunday opener").waitFor();
  await page.getByText("Sing it").waitFor();
  await page.getByRole("button", { name: "Ask for changes" }).click();
  await page.getByText("Write a note for the submitter.").waitFor();
  await page.getByLabel("Note for the submitter").fill("Please add the verse");
  await page.getByRole("button", { name: "Ask for changes" }).click();
  await page.getByText("Changes requested").first().waitFor();
});

await step("the submitter sees the note and resubmits", async () => {
  page = alicePage;
  await openSong(page, aliceSong.id);
  await page.getByText("Changes requested").waitFor();
  await page.getByText("Please add the verse").waitFor();
  await page.getByLabel("What did you change? (optional)").fill("Verse added");
  await page.getByRole("button", { name: "Resubmit" }).click();
  await page.getByText("Waiting for review").waitFor();
});

await step("the reviewer starts the review and approves it", async () => {
  page = reviewerPage;
  await openSubmission(title, "Pub web alice");
  await page.getByText("Verse added").waitFor();
  await page.getByRole("button", { name: "Start review" }).click();
  await page.getByText("In review").first().waitFor();
  await page.getByLabel("Trust label (optional)").fill("Checked");
  await page.getByRole("button", { name: "Approve and publish" }).click();
  await page.getByText("Published as").waitFor();
});

await step("the submitter's song is now in the catalogue, credited to them, and listed once (issue #73)", async () => {
  page = alicePage;
  await openSong(page, aliceSong.id);
  await page.getByText("In the catalogue, from Pub web alice").waitFor();
  await page.getByText("only admins change it. You can suggest a change.").waitFor();
  if (await page.getByText("Global catalogue", { exact: true }).count()) throw new Error("the publish card on a catalogue song");
  await page.goto(`${WEB}/library?q=${encodeURIComponent(title)}`);
  await page.waitForLoadState("networkidle");
  const rows = page.getByRole("row").filter({ hasText: title });
  await rows.first().getByText("Published by you").waitFor();
  if ((await rows.count()) !== 1) throw new Error(`${await rows.count()} rows`);
});

await step("a look-alike needs a reason before it's submitted", async () => {
  page = await pageFor(bob);
  await openSong(page, bobSong.id);
  await page.getByRole("button", { name: "Submit for review" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByText("Similar songs already in the catalogue").waitFor();
  await dialog.getByText("Same title").waitFor();
  await dialog.getByRole("button", { name: "Submit for review" }).click();
  await dialog.getByText("Say why this one should be added too.").waitFor();
  await dialog.getByLabel("Why should this one be added too?").fill("Our arrangement");
  await dialog.getByRole("button", { name: "Submit for review" }).click();
  await page.getByText("Waiting for review").waitFor();
  await page.close();
});

await step("the reviewer merges it into the existing song", async () => {
  page = reviewerPage;
  await openSubmission(title, "Pub web bob");
  await page.getByText("Our arrangement").waitFor();
  await page.getByRole("button", { name: "Merge into this one" }).click();
  await page.getByText("Published as").waitFor();
  const globals = sql(`select count(*) from "SongVersion" where "ownerScope"='GLOBAL' and title='${title}'`);
  if (globals !== "1") throw new Error(`${globals} global copies`);
});

await step("the merged song is folded into the catalogue one: the library lists it once (#75)", async () => {
  page = await pageFor(bob);
  await page.goto(`${WEB}/library?q=${encodeURIComponent(title)}`);
  await page.waitForLoadState("networkidle");
  const rows = page.getByRole("row").filter({ hasText: title });
  await rows.first().waitFor();
  if ((await rows.count()) !== 1) throw new Error(`${await rows.count()} rows`);
  await page.close();
});

await step("a global admin publishes their own song directly", async () => {
  page = await pageFor(admin);
  await openSong(page, adminSong.id);
  await page.getByRole("button", { name: "Submit for review" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByText("without a review").waitFor();
  await dialog.getByRole("button", { name: "Publish now" }).click();
  await page.getByText("In the catalogue, from Pub web admin").waitFor();
});

await step("the page fits a phone", async () => {
  page = reviewerPage;
  await page.setViewportSize({ width: 360, height: 800 });
  await openSubmission(title, "Pub web alice", "closed");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  if (overflow > 0) throw new Error(`${overflow}px sideways scroll`);
  await page.setViewportSize({ width: 1280, height: 900 });
});

await step("removing the role closes the queue", async () => {
  const r = await call(admin, "PUT", `/admin/users/${reviewer.id}/roles`, { roleIds: [] });
  if (r.status !== 204) throw new Error(String(r.status));
  page = reviewerPage;
  await page.goto(`${WEB}/review`);
  await page.waitForURL("**/dashboard");
});

await browser.close();
finish();
