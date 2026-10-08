// Chords into the next song of a set (issues #10, #217): for a transition,
// chords suggested from music theory, from the song's last chord to the next
// one's first, as the set plays them - its dominant, a ii-V, a chord both
// keys share... - as many as asked for, or typed, every chord heard with a
// tap; kept as degrees of the next song's key, so moving that song moves
// them. In Live (issue #214) a segue or transition stacks the next song
// under it on the same page, the transition between them, changed there;
// the song being played follows the scroll; a setting turns it off. The
// transition is compact - its chords as one row of steps - and opened, shows
// their diagrams and the other ways in.
import { chromium } from "playwright";
import { WEB, api, call, check, finish, signIn, stamp, stepper, user } from "../lib/harness.mjs";

let page;
const step = stepper(() => page);
const leader = await user("Transition chords");
// Guitar diagrams on: shown under the transition's chords once it's opened.
await api(leader, "PATCH", "/users/me", { chordDiagrams: "GUITAR" });

const lines = (chords) => chords.map((chord, i) => `[${chord}]Line ${i + 1} of the song`).join("\n");
const song = (title, key, chords) =>
  api(leader, "POST", "/song-versions", { title: `${title} ${stamp}`, language: "en", artists: ["Band"], key, tempo: 90, content: `{start_of_verse}\n${lines(chords)}\n{end_of_verse}\n`, contentFormat: "CHORDPRO" });
const first = await song("In G", "G", ["G", "C", "D", "Em", "C", "G"]);
const second = await song("In D", "D", ["D", "G", "A", "Bm", "G", "A", "D", "G", "A", "D"]);
const third = await song("In A", "A", ["A", "E", "A"]);
const set = await api(leader, "POST", "/setlists", { name: `Chords set ${stamp}` });
for (const one of [first, second, third]) await api(leader, "POST", `/setlists/${set.id}/items`, { songVersionId: one.id });
const items = async () => (await api(leader, "GET", `/setlists/${set.id}`)).items;
const [firstItem, secondItem] = (await items()).map((item) => item.id);

// Through the API: kept as degrees of the next song's key, with where it goes from and to.
let r = await call(leader, "PATCH", `/setlists/${set.id}/items/${firstItem}`, { transition: "TRANSITION", transitionChords: ["2m7", "57"] });
check("chords kept as degrees", r.status === 200 && JSON.stringify(r.body.items[0].transitionChords) === JSON.stringify(["2m7", "57"]), JSON.stringify(r.body.items?.[0]?.transitionChords));
check("each song's first and last chords, as played", JSON.stringify(r.body.items[1].edgeChords) === JSON.stringify({ first: "D", last: "D" }), JSON.stringify(r.body.items[1].edgeChords));
let view = await api(leader, "GET", `/setlists/${set.id}/items/${firstItem}/song`);
check(
  "Live's view: the chords, from the last chord to the next song's first",
  JSON.stringify(view.transition.chords) === JSON.stringify(["2m7", "57"]) && view.transition.toKey === "D" && view.transition.lastChord === "G" && view.transition.firstChord === "D",
  JSON.stringify(view.transition),
);
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

  await step("the set's page: from G to D, the ways in, their variations, to hear, and Fast", async () => {
    await page.evaluate(() => localStorage.setItem("songverse.mode", "edit"));
    await page.goto(`${WEB}/sets/${set.id}`);
    await page.waitForLoadState("networkidle");
    await row().getByTestId("set-song-transition-chords").click();
    const picker = page.getByTestId("transition-chords-picker");
    await picker.getByText("Chords into D").waitFor();
    // Framed by the song's last chord and the next one's first.
    await picker.getByTestId("transition-last-chord").locator('[data-chord="G"]').waitFor();
    await picker.getByTestId("transition-first-chord").locator('[data-chord="D"]').waitFor();
    const kinds = await picker.getByTestId("transition-suggestion").evaluateAll((all) => all.map((one) => one.dataset.kind).join(" "));
    if (kinds !== "dominant two-five sus-dominant altered diminished pivot chromatic-bass backdoor") throw new Error(kinds);
    // The three for a band, marked.
    if ((await picker.getByTestId("transition-recommended").count()) !== 3) throw new Error("not three recommended");
    const twoFive = picker.locator('[data-testid="transition-suggestion"][data-kind="two-five"]');
    if ((await twoFive.getAttribute("data-degrees")) !== "2m7 57") throw new Error(await twoFive.getAttribute("data-degrees"));
    await twoFive.locator('[data-testid="transition-variation"][data-degrees="2m7 57b9"]').waitFor();
    // From the last chord: the bass walking down into the next song's first (G, F#m, Em, D).
    await picker.locator('[data-kind="chromatic-bass"][data-degrees="3m 2m"]').locator('[data-chord="F#m"]').first().waitFor();
    // Numbers as Nashville charts write them: the 7th raised, not "57"; a diminished 7th as °7.
    await picker.locator('[data-kind="dominant"] sup').first().getByText("7").waitFor();
    await picker.locator('[data-kind="diminished"] sup').first().getByText("°7").waitFor();
    // A chord tapped is heard, not chosen.
    await twoFive.locator('[data-chord="Em7"]').first().click();
    await page.waitForTimeout(300);
    if ((await items())[0].transitionChords.length) throw new Error("chosen by tapping a chord");
    // Fast: one chord each.
    await picker.getByTestId("transition-fast").click();
    await picker.locator('[data-kind="dominant"]').waitFor();
    const forms = await picker.locator('[data-testid="transition-form"], [data-testid="transition-variation"]').evaluateAll((all) => all.map((one) => one.dataset.degrees));
    if (forms.length === 0 || forms.some((one) => one.includes(" "))) throw new Error(JSON.stringify(forms));
    await picker.getByTestId("transition-fast").click();
    await picker.locator('[data-kind="sus-dominant"] [data-testid="transition-form"]').getByTestId("transition-suggestion-use").click();
    await saved(["57sus4", "57"]);
    await row().getByTestId("set-song-transition-chords").getByText("A7sus4 A7").waitFor();
  });

  await step("typed: letters or numbers", async () => {
    await row().getByTestId("set-song-transition-chords").click();
    await page.getByTestId("transition-chords-typed").fill("Bm Em7 A7");
    await page.getByTestId("transition-chords-typed-use").click();
    await saved(["6m", "2m7", "57"]);
    await row().getByTestId("set-song-transition-chords").click();
    await page.getByTestId("transition-chords-typed").fill("hello");
    await page.getByTestId("transition-chords-typed-use").click();
    await page.getByText("Not chords").waitFor();
    await page.getByTestId("transition-chords-typed").fill("2m7 57");
    await page.getByTestId("transition-chords-typed-use").click();
    await saved(["2m7", "57"]);
  });

  await step("Live: the next song stacked under it, the transition between them", async () => {
    await page.goto(`${WEB}/sets/${set.id}/live/${firstItem}`);
    await page.getByTestId("live-view").waitFor();
    const songs = page.getByTestId("live-song");
    await songs.nth(1).waitFor();
    // The third comes after a song with nothing said: on its own page.
    if ((await songs.count()) !== 2) throw new Error(`${await songs.count()} songs on the page`);
    const block = page.locator('[data-testid="live-transition-block"][data-between]');
    await block.locator('[data-step="last"][data-chord="G"]').waitFor();
    await block.locator('[data-step="step"][data-chord="Em7"]').waitFor();
    await block.locator('[data-step="step"][data-chord="A7"]').click();
    await block.locator('[data-step="first"][data-chord="D"]').waitFor();
  });

  await step("Live: the transition's chords changed there", async () => {
    const block = page.locator('[data-testid="live-transition-block"][data-between]');
    // Compact by default: no diagrams, no choices.
    if (await block.getByTestId("transition-chords-chooser").count()) throw new Error("opened by default");
    if (await block.locator("[data-step] svg").count()) throw new Error("diagrams shown compact");
    // Opened: the other ways in, to pick from there.
    await block.getByTestId("live-transition-expand").click();
    await block.locator('[data-step="step"] svg').first().waitFor();
    await block.getByTestId("transition-chords-chooser").locator('[data-kind="altered"] [data-testid="transition-form"]').getByTestId("transition-suggestion-use").click();
    await saved(["57b9"]);
    await block.locator('[data-step="step"][data-chord="A7b9"]').waitFor();
  });

  await step("Live: Next scrolls on into the stacked song, which becomes the one playing", async () => {
    await page.getByTestId("live-next").click();
    await page.waitForFunction((item) => location.pathname.endsWith(`/live/${item}`), secondItem);
    await page.locator(`[data-testid="live-song"][data-item="${secondItem}"][data-current]`).waitFor();
    // The same page: the first song still above it, now played; the sidebar marks the second.
    if ((await page.getByTestId("live-song").count()) !== 2) throw new Error("left the page");
    await page.getByTestId("sidebar-set-song").filter({ hasText: `In D ${stamp}` }).getByTestId("sidebar-now").waitFor();
    await page.waitForFunction(
      ([id, current, played]) => {
        const progress = JSON.parse(localStorage.getItem(`songverse.sets.progress.${id}`) ?? "null");
        return progress?.current === current && progress.played.includes(played);
      },
      [set.id, secondItem, firstItem],
    );
    await page.getByTestId("live-next").getByText(`Next: In A ${stamp}`).waitFor();
    // Reloaded: the same page, at the song being played.
    if (!page.url().includes(`from=${firstItem}`)) throw new Error(page.url());
    await page.reload();
    await page.locator(`[data-testid="live-song"][data-item="${secondItem}"][data-current]`).waitFor();
    if ((await page.getByTestId("live-song").count()) !== 2) throw new Error("not the same page");
    await page.waitForTimeout(500);
    if (!page.url().includes(`/live/${secondItem}`)) throw new Error(`moved: ${page.url()}`);
    // Past the end of the stack: the next page.
    await page.getByTestId("live-next").click();
    await page.locator(`[data-testid="live-song"][data-item="${(await items())[2].id}"]`).waitFor();
  });

  await step("Live: the next song moved up a tone - the same degrees, in E", async () => {
    await api(leader, "PATCH", `/setlists/${set.id}/items/${secondItem}`, { transposeSteps: 2 });
    await page.goto(`${WEB}/sets/${set.id}/live/${firstItem}`);
    const chords = page.getByTestId("live-transition-chords");
    await chords.locator('[data-step="step"][data-chord="B7b9"]').waitFor();
    await page.locator('[data-step="first"][data-chord="E"]').waitFor();
  });

  await step("Live: a key changed at the last minute moves the transition with it", async () => {
    const keyOf = (item) => page.locator(`[data-testid="live-song"][data-item="${item}"]`).locator("button[aria-expanded]").first();
    // The next song up a semitone more (E to F): its first chord, and the chords into it, follow.
    await keyOf(secondItem).click();
    await page.getByTestId("live-transpose").getByRole("button", { name: "Up a semitone" }).click();
    const block = page.locator('[data-testid="live-transition-block"][data-between]');
    await block.locator('[data-step="first"][data-chord="F"]').waitFor();
    await block.locator('[data-step="step"][data-chord="C7b9"]').waitFor();
    await block.getByTestId("live-transition").getByText(/G → F/).waitFor();
    // This song down a semitone (G to F#): where it starts follows.
    // (The open transpose box closes with a tap elsewhere.)
    await page.locator(`[data-testid="live-song"][data-item="${firstItem}"] h1`).click();
    await keyOf(firstItem).click();
    await page.getByTestId("live-transpose").getByRole("button", { name: "Down a semitone" }).click();
    await block.locator('[data-step="last"][data-chord="F#"], [data-step="last"][data-chord="Gb"]').first().waitFor();
    // Only here, tonight: the set keeps its chords as they were.
    if (JSON.stringify((await items())[0].transitionChords) !== JSON.stringify(["57b9"])) throw new Error("changed in the set");
    // Gone with the page: back to the set's keys.
    await page.reload();
    await page.getByTestId("live-view").waitFor();
    await page.waitForLoadState("networkidle");
    await page.locator('[data-testid="live-transition-block"][data-between]').locator('[data-step="first"][data-chord="E"]').waitFor();
  });

  await step("Stack segues and transitions, turned off on this device: a song per page", async () => {
    await page.goto(`${WEB}/sets/${set.id}/live/${firstItem}`);
    await page.getByTestId("live-song").nth(1).waitFor();
    await page.getByTestId("sidebar-set-details").click();
    await page.getByTestId("sidebar-stack-segues").click();
    await page.keyboard.press("Escape");
    await page.waitForFunction(() => document.querySelectorAll('[data-testid="live-song"]').length === 1);
    await page.reload();
    await page.getByTestId("live-view").waitFor();
    await page.waitForLoadState("networkidle");
    if ((await page.getByTestId("live-song").count()) !== 1) throw new Error("still stacked");
    await page.getByTestId("live-transition-block").waitFor();
  });
} finally {
  await browser.close();
}
finish();
