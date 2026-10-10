// Availability in the browser (issue #235): a member answers a date on the
// team's calendar (pressed again, the answer goes), with a note; the
// admin sees the counts and "Who can play", with the note, and answers for
// someone. My calendar (from the sidebar) lists the dates of all one's
// teams; days away read Not available, marked Away, until answered.
import { chromium } from "playwright";
import { WEB, api, finish, signIn, sql, stamp, stepper, user } from "../lib/harness.mjs";

let page;
const step = stepper(() => page);
const admin = await user("Avail admin");
const member = await user("Avail member");
const team = await api(admin, "POST", "/teams", { name: `Avail ${stamp}` });
sql(`insert into "TeamMembership" (id, "teamId", "userId", role, "joinedAt", "updatedAt") values ('tmv${stamp}', '${team.id}', '${member.id}', 'MEMBER', now(), now())`);
const plus = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
const first = plus(2);
await api(admin, "POST", `/teams/${team.id}/events`, { title: "Morning service", date: first, startTime: "10:00", timeZone: "UTC", repeat: { everyWeeks: 1 } });

const browser = await chromium.launch();
try {
  page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, timezoneId: "UTC" });
  const row = (date) => page.locator(`[data-event-date="${date}"]`).first();

  await step("a member answers Available on the team's calendar, with a note; pressed again, it's taken back", async () => {
    await signIn(page, member);
    await page.goto(`${WEB}/teams/${team.id}`);
    await row(first).getByTestId("answer-AVAILABLE").click();
    await row(first).locator('[data-answer="AVAILABLE"]').waitFor();
    await row(first).getByTestId("answer-note").click();
    await page.getByRole("textbox", { name: "Note for the team's admins" }).fill("Keys only");
    await page.getByTestId("answer-note-save").click();
    await row(first).getByText("Keys only").waitFor();
    if (await row(first).getByTestId("calendar-answers").count()) throw new Error("a member sees the counts");
    await row(plus(9)).getByTestId("answer-IF_NEEDED").click();
    await row(plus(9)).locator('[data-answer="IF_NEEDED"]').waitFor();
    await row(plus(9)).getByTestId("answer-IF_NEEDED").click();
    await row(plus(9)).locator('[data-answer="NONE"]').waitFor();
  });

  await step("My calendar, from the sidebar: days away read Not available, marked Away, until answered", async () => {
    await page.getByTestId("sidebar-rail").getByRole("link", { name: "My calendar" }).click();
    await page.waitForURL(/\/calendar$/);
    await row(first).getByText(`Avail ${stamp}`).waitFor();
    await page.getByLabel("From").fill(plus(8));
    await page.getByLabel("To", { exact: true }).fill(plus(10));
    await page.getByLabel("Note (optional)").fill("Holidays");
    await page.getByTestId("away-add").click();
    await page.locator(`[data-away-range="${plus(8)}/${plus(10)}"]`).waitFor();
    await row(plus(9)).getByTestId("answer-away").waitFor();
    await row(plus(9)).locator('[data-answer="UNAVAILABLE"][data-away]').waitFor();
    await row(plus(16)).getByTestId("answer-UNAVAILABLE").click();
    await row(plus(16)).locator('[data-answer="UNAVAILABLE"]:not([data-away])').waitFor();
  });

  await step("the admin sees the counts and who can play, with notes and days away, and answers for someone", async () => {
    await page.context().clearCookies();
    await signIn(page, admin);
    await page.goto(`${WEB}/teams/${team.id}`);
    const counts = row(first).getByTestId("calendar-answers");
    await counts.getByText("✓ 1").waitFor();
    await counts.click();
    const dialog = page.getByTestId("answers-dialog");
    const memberRow = dialog.locator(`[data-member="${member.id}"]`);
    await memberRow.getByText("Keys only").waitFor();
    const adminRow = dialog.locator(`[data-member="${admin.id}"]`);
    await adminRow.locator('[data-answer="NONE"]').waitFor();
    await page.getByRole("button", { name: "Close" }).last().click();
    // The week away: Not available, its note.
    await row(plus(9)).getByTestId("calendar-answers").click();
    await page.getByTestId("answers-dialog").locator(`[data-member="${member.id}"]`).getByText("Holidays").waitFor();
    // Answering for the member: marked as answered by the admin.
    await page.getByTestId("answers-dialog").locator(`[data-member="${member.id}"]`).getByTestId("answer-AVAILABLE").click();
    await page.getByTestId("answers-dialog").locator(`[data-member="${member.id}"]`).getByText("Answered by").waitFor();
    await page.getByRole("button", { name: "Close" }).last().click();
    await row(plus(9)).getByTestId("calendar-answers").getByText("✓ 1").waitFor();
  });
} finally {
  await browser.close();
}
finish();
