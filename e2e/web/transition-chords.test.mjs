// Chords into the next song of a set (issue #10, phase 6 of #207): for a
// transition, chords suggested from music theory for the two keys as
// they're played - the new key's dominant, a ii-V, a chord both keys
// share... - as many as asked for, or typed; kept as degrees of the next
// song's key, so moving that song moves them; Live shows them, to see and
// hear.
import { chromium } from "playwright";
import { WEB, api, call, check, finish, signIn, stamp, stepper, user } from "../lib/harness.mjs";

let page;
const step = stepper(() => page);
const leader = await user("Transition chords");

const song = (title, key) =>
  api(leader, "POST", "/song-versions", { title: `${title} ${stamp}`, language: "en", artists: ["Band"], key, content: "{start_of_chorus}\n[G]Short [C]song\n{end_of_chorus}\n", contentFormat: "CHORDPRO" });
const [first, second] = [await song("In G", "G"), await song("In D", "D")];
const set = await api(leader, "POST", "/setlists", { name: `Chords set ${stamp}` });
for (const one of [first, second]) await api(leader, "POST", `/setlists/${set.id}/items`, { songVersionId: one.id });
const items = async () => (await api(leader, "GET", `/setlists/${set.id}`)).items;
const [firstItem, secondItem] = (await items()).map((item) => item.id);

// Through the API: kept as degrees of the next song's key.
let r = await call(leader, "PATCH", `/setlists/${set.id}/items/${firstItem}`, { transition: "TRANSITION", transitionChords: ["2m7", "57"] });
check("chords kept as degrees", r.status === 200 && JSON.stringify(r.body.items[0].transitionChords) === JSON.stringify(["2m7", "57"]), JSON.stringify(r.body.items?.[0]));
let view = await api(leader, "GET", `/setlists/${set.id}/items/${firstItem}/song`);
check("Live's view has them, with the next song's key", JSON.stringify(view.transition.chords) === JSON.stringify(["2m7", "57"]) && view.transition.toKey === "D", JSON.stringify(view.transition));
r = await call(leader, "PATCH", `/setlists/${set.id}/items/${firstItem}`, { transitionChords: ["Em7"] });
check("letters aren't degrees: refused", r.status === 400 && r.body.message.some((one) => /transitionChords/.test(one)), JSON.stringify(r.body));
r = await call(leader, "PATCH", `/setlists/${set.id}/items/${firstItem}`, { transitionChords: [] });
check("cleared", r.status === 200 && r.body.items[0].transitionChords.length === 0);

const browser = await chromium.launch();
try {
  page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await signIn(page, leader);
  const row = () => page.getByTestId("set-song-row").filter({ hasText: `In G ${stamp}` });
  const saved = async (wanted) => {
    for (let i = 0; i < 20; i++) {
      const kept = JSON.stringify((await items())[0].transitionChords);
      if (kept === JSON.stringify(wanted)) return;
      await page.waitForTimeout(250);
    }
    throw new Error(`not saved: ${JSON.stringify((await items())[0].transitionChords)}`);
  };

  await step("the set's page: suggestions from G into D, and how many chords", async () => {
    await page.evaluate(() => localStorage.setItem("songverse.mode", "edit"));
    await page.goto(`${WEB}/sets/${set.id}`);
    await page.waitForLoadState("networkidle");
    await row().getByTestId("set-song-transition-chords").click();
    const picker = page.getByTestId("transition-chords-picker");
    await picker.getByText("Chords into D").waitFor();
    const twoFive = picker.locator('[data-testid="transition-suggestion"][data-kind="two-five"]');
    if (!(await twoFive.textContent()).includes("Em7 A7")) throw new Error(await twoFive.textContent());
    await picker.getByTestId("transition-chord-count").selectOption("1");
    await picker.locator('[data-kind="dominant"]').waitFor();
    if ((await picker.getByTestId("transition-suggestion").count()) !== 1) throw new Error("more than the one-chord ones");
    await picker.getByTestId("transition-chord-count").selectOption("3");
    await picker.locator('[data-kind="pivot"]').getByText("Bm Em7 A7").waitFor();
    await picker.locator('[data-kind="pivot"]').click();
    await saved(["6m", "2m7", "57"]);
    await row().getByTestId("set-song-transition-chords").getByText("Bm Em7 A7").waitFor();
  });

  await step("typed: letters or numbers", async () => {
    await row().getByTestId("set-song-transition-chords").click();
    const picker = page.getByTestId("transition-chords-picker");
    await picker.getByTestId("transition-chords-typed").fill("A7sus4 A7");
    await picker.getByRole("button", { name: "Use" }).click();
    await saved(["57sus4", "57"]);
    await row().getByTestId("set-song-transition-chords").click();
    await page.getByTestId("transition-chords-typed").fill("hello");
    await page.getByRole("button", { name: "Use" }).click();
    await page.getByText("Not chords").waitFor();
    await page.getByTestId("transition-chords-typed").fill("2m7 57");
    await page.getByRole("button", { name: "Use" }).click();
    await saved(["2m7", "57"]);
  });

  await step("Live: the chords before the end, in the next song's key as it's played", async () => {
    await page.goto(`${WEB}/sets/${set.id}/live/${firstItem}`);
    const chords = page.getByTestId("live-transition-chords");
    await chords.locator('[data-chord="Em7"]').waitFor();
    await chords.locator('[data-chord="A7"]').waitFor();
    // The next song moved up a tone: the same degrees, in E.
    await api(leader, "PATCH", `/setlists/${set.id}/items/${secondItem}`, { transposeSteps: 2 });
    await page.reload();
    await chords.locator('[data-chord="F#m7"]').waitFor();
    await chords.locator('[data-chord="B7"]').click();
  });
} finally {
  await browser.close();
}
finish();
