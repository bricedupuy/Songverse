// Where a team's event sets are listed (issue #235): in the sidebar only
// for coming dates one signed up for (answered Available) - answering
// puts it there, taking the answer back removes it; coming dates one
// didn't sign up for are on the Sets page; past dates' sets leave both,
// to the Sets page's Archive for the ones one took part in, and to the
// team's Past dates. Sets made by hand are listed as always.
import { chromium } from "playwright";
import { WEB, api, call, check, finish, signIn, sql, stamp, stepper, user } from "../lib/harness.mjs";

let page;
const step = stepper(() => page);
const admin = await user("Event sets admin");
const member = await user("Event sets member");
const team = await api(admin, "POST", "/teams", { name: `Event sets ${stamp}` });
sql(`insert into "TeamMembership" (id, "teamId", "userId", role, "joinedAt", "updatedAt") values ('tmes${stamp}', '${team.id}', '${member.id}', 'MEMBER', now(), now())`);
const today = new Date().toISOString().slice(0, 10);
const plus = (n) => new Date(Date.parse(`${today}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
// Every week since two weeks ago, in UTC: today, then a week on.
const event = await api(admin, "POST", `/teams/${team.id}/events`, { title: `Sunday ${stamp}`, date: plus(-14), startTime: "23:00", timeZone: "UTC", repeat: { everyWeeks: 1 } });
const setOf = async (date) => (await api(admin, "POST", `/teams/${team.id}/events/${event.id}/dates/${date}/set`)).setlistId;
const [pastIn, pastOut, comingIn, comingOut] = [await setOf(plus(-7)), await setOf(plus(-14)), await setOf(today), await setOf(plus(7))];
// A past date the member took part in (answers for dates that are over aren't taken any more).
sql(`insert into "TeamEventAnswer" (id, "eventId", date, "userId", answer, "updatedAt") values ('tea${stamp}', '${event.id}', '${plus(-7)}', '${member.id}', 'AVAILABLE', now())`);
await api(member, "PUT", `/teams/${team.id}/events/${event.id}/dates/${today}/answer`, { answer: "AVAILABLE" });
const byHand = await api(admin, "POST", "/setlists", { name: `By hand ${stamp}`, teamId: team.id });

const list = await api(member, "GET", "/setlists");
const flags = (id) => {
  const set = list.find((one) => one.id === id);
  return set && `${set.fromEvent}/${set.signedUp}/${set.past}`;
};
check("the set list says, for each event set, whether one signed up and whether it's over", flags(comingIn) === "true/true/false" && flags(comingOut) === "true/false/false" && flags(pastIn) === "true/true/true" && flags(pastOut) === "true/false/true" && flags(byHand.id) === "false/undefined/undefined", [comingIn, comingOut, pastIn, pastOut, byHand.id].map(flags).join(" "));

const browser = await chromium.launch();
try {
  page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, timezoneId: "UTC" });
  await signIn(page, member);
  const panel = () => page.locator('[data-slot="sidebar"]').first();
  const inSidebar = (id) => panel().locator(`a[href="/sets/${id}"]`);

  await step("the sidebar: the coming date signed up for, and the set made by hand; not the others", async () => {
    await page.goto(`${WEB}/sets`);
    await inSidebar(comingIn).waitFor();
    await inSidebar(byHand.id).waitFor();
    for (const id of [comingOut, pastIn, pastOut]) if (await inSidebar(id).count()) throw new Error(`in the sidebar: ${id}`);
  });

  await step("the Sets page: the coming dates, signed up or not; the past one taken part in, under Archive", async () => {
    const table = page.locator("table").first();
    await table.getByText(`Sunday ${stamp}`).first().waitFor();
    const archive = page.getByTestId("sets-archive");
    await archive.waitFor();
    if ((await archive.locator("tbody tr").count()) !== 1) throw new Error("not one set in the archive");
    // Both coming dates, signed up for or not; neither past one.
    const day = (date) => new Date(`${date}T00:00:00Z`).toLocaleDateString("en", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
    for (const date of [today, plus(7)]) await table.locator("tbody tr").filter({ hasText: day(date) }).first().waitFor();
    for (const date of [plus(-7), plus(-14)]) if (await table.locator("tbody tr").filter({ hasText: day(date) }).count()) throw new Error(`a past date in the list: ${date}`);
    await archive.locator("tbody tr").filter({ hasText: day(plus(-7)) }).waitFor();
  });

  await step("answering Available puts the date's set in the sidebar; taking it back removes it", async () => {
    // On My calendar, the sidebar's panel stays on Sets.
    await page.goto(`${WEB}/sets`);
    await page.getByRole("link", { name: "My calendar" }).first().click();
    await page.waitForURL(/\/calendar$/);
    const row = page.locator(`[data-event-date="${plus(7)}"]`).first();
    await row.getByTestId("answer-AVAILABLE").click();
    await inSidebar(comingOut).waitFor();
    await row.getByTestId("answer-AVAILABLE").click();
    await inSidebar(comingOut).waitFor({ state: "detached" });
  });

  await step("the team's Past dates: newest first, with their sets", async () => {
    await page.goto(`${WEB}/teams/${team.id}`);
    await page.getByTestId("calendar-past-toggle").click();
    const rows = page.getByTestId("calendar-past").locator("[data-past-date]");
    await rows.first().waitFor();
    const dates = await rows.evaluateAll((els) => els.map((el) => el.getAttribute("data-past-date")));
    if (JSON.stringify(dates) !== JSON.stringify([plus(-7), plus(-14)])) throw new Error(JSON.stringify(dates));
    await rows.first().getByTestId("calendar-past-set").click();
    await page.waitForURL(new RegExp(`/sets/${pastIn}$`));
  });
} finally {
  await browser.close();
}
finish();
