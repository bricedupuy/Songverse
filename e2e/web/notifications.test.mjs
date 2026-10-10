// Notifications in the browser (issue #236): the bell in the top bar shows
// how many are unread; its list puts each into words in the reader's
// language; pressing one opens what it's about and marks it read; Mark all
// as read clears the count.
import { chromium } from "playwright";
import { WEB, api, finish, signIn, sql, stamp, stepper, user } from "../lib/harness.mjs";

let page;
const step = stepper(() => page);
const admin = await user("Bell admin");
const member = await user("Bell member");
const team = await api(admin, "POST", `/teams`, { name: `Bell ${stamp}` });
sql(`insert into "TeamMembership" (id, "teamId", "userId", role, "joinedAt", "updatedAt") values ('tmb${stamp}', '${team.id}', '${member.id}', 'MEMBER', now(), now())`);
const plus = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
const first = plus(2);
const event = await api(admin, "POST", `/teams/${team.id}/events`, { title: "Morning service", date: first, startTime: "10:00", timeZone: "UTC", repeat: { everyWeeks: 1 } });
const base = `/teams/${team.id}/events/${event.id}/dates`;
await api(member, "PUT", `${base}/${first}/answer`, { answer: "AVAILABLE" });
await api(admin, "PATCH", `${base}/${first}`, { startTime: "09:30" });
await api(admin, "PUT", `${base}/${plus(9)}/answers/${member.id}`, { answer: "IF_NEEDED" });

const browser = await chromium.launch();
try {
  page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, timezoneId: "UTC" });

  await step("the bell shows two unread; its list says what happened", async () => {
    await signIn(page, member);
    await page.goto(`${WEB}/sets`);
    await page.getByTestId("notification-count").filter({ hasText: "2" }).waitFor();
    await page.getByTestId("notification-bell").click();
    const list = page.getByTestId("notification-list");
    await list.getByText("Morning service on").first().waitFor();
    await list.getByText("now at 09:30").waitFor();
    await list.getByText("Bell admin answered for you: If needed").waitFor();
    if ((await list.locator('[data-read="false"]').count()) !== 2) throw new Error("both should be unread");
  });

  await step("pressing one opens My calendar and marks it read", async () => {
    await page.locator('[data-notification="EVENT_DATE_CHANGED"]').click();
    await page.waitForURL(/\/calendar$/);
    await page.getByTestId("notification-count").filter({ hasText: "1" }).waitFor();
  });

  await step("Mark all as read clears the count", async () => {
    await page.getByTestId("notification-bell").click();
    await page.getByTestId("notification-read-all").click();
    await page.getByTestId("notification-count").waitFor({ state: "detached" });
    if ((await page.locator('[data-read="false"]').count()) !== 0) throw new Error("all should be read");
  });

  await step("in French, in French words", async () => {
    sql(`update "User" set locale = 'fr' where id = '${member.id}'`);
    await page.goto(`${WEB}/sets`);
    await page.getByTestId("notification-bell").click();
    await page.getByTestId("notification-list").getByText("Bell admin a répondu pour vous : Si besoin").waitFor();
  });
} finally {
  await browser.close();
}
finish();
