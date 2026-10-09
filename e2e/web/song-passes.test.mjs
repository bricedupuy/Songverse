// A section sung again with changes of its own (issue #205): from a
// section's menu, "Sing again (linked)" adds a pass of it to the song's
// order; that pass can be transposed by itself, sing only some of the
// section's lines, and have its own chords (replaced or left out) - the
// section itself staying as it is. Such a pass is marked * in the order
// and on the chart, is stored with the song, and goes back to the section
// as written in one click.
import { chromium } from "playwright";
import { WEB, api, finish, signIn, stamp, stepper, user } from "../lib/harness.mjs";

let page;
const step = stepper(() => page);
const me = await user("Song passes");
const song = await api(me, "POST", "/song-versions", {
  title: `Passes ${stamp}`,
  language: "en",
  artists: ["Band"],
  key: "C",
  content: "{start_of_verse}\n[C]Amazing grace\n{end_of_verse}\n{start_of_chorus}\n[C]My chains are [G]gone\n[D]I've been set [C]free\n{end_of_chorus}\n",
  contentFormat: "CHORDPRO",
});
const stored = async () => (await api(me, "GET", `/song-versions/${song.id}`)).documentJson;
const doc = await stored();
const chorus = doc.sections.find((section) => section.type === "chorus");
const [first, second] = chorus.lines;
const [d, cFree] = second.chords;

const browser = await chromium.launch();
try {
  page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
  await signIn(page, me);
  const order = () => page.getByTestId("song-order");

  await step("from the chorus's menu: sung again, linked - a pass of it opened in the song's order", async () => {
    await page.goto(`${WEB}/library/${song.id}?tab=editor`);
    await page.waitForLoadState("networkidle");
    await page.locator('[data-section-type="chorus"]').getByRole("button", { name: "Chorus actions" }).click();
    await page.getByTestId("section-sing-again").click();
    await page.getByTestId("song-order-pass").getByText("Pass 3: Chorus").waitFor();
    if ((await order().getByRole("listitem").count()) !== 4) throw new Error("not a third pass");
  });

  await step("its own changes: a tone up, only the last line, one chord replaced and one left out - marked *", async () => {
    await page.getByTestId("song-order-transpose").selectOption("2");
    await page.getByTestId("song-order-lines-from").selectOption(second.id);
    await page.getByTestId(`song-order-chord-${d.id}`).fill("Am");
    await page.getByTestId(`song-order-chord-hide-${cFree.id}`).click();
    await order().locator("[data-pass-changed]").waitFor();
    if ((await order().locator("[data-pass-changed]").count()) !== 1) throw new Error("other passes marked");
  });

  await step("saved with the song; the section itself unchanged", async () => {
    await page.getByRole("button", { name: "Save song" }).first().click();
    let pass;
    for (let i = 0; i < 40 && !pass?.transpose; i++) {
      pass = (await stored()).flow[2];
      if (!pass?.transpose) await page.waitForTimeout(250);
    }
    if (pass.transpose !== 2 || pass.lines?.from !== second.id || pass.lines?.to !== second.id) throw new Error(JSON.stringify(pass));
    const chords = Object.fromEntries(pass.chords.map((change) => [change.chordId, change.raw]));
    if (chords[d.id] !== "Am" || chords[cFree.id] !== null) throw new Error(JSON.stringify(pass.chords));
    const section = (await stored()).sections.find((one) => one.id === chorus.id);
    if (section.lines[1].chords.map((chord) => chord.raw).join() !== "D,C") throw new Error("the section changed");
  });

  await step("the chart: that pass alone, with its line and chords, marked *", async () => {
    await page.getByRole("radiogroup", { name: "Mode" }).getByRole("radio", { name: "Practice" }).click();
    const passes = page.getByTestId("song-chart").locator("[data-pass]");
    await passes.nth(2).waitFor();
    const third = passes.nth(2);
    await third.locator("[data-pass-changed]").waitFor();
    if (await passes.nth(1).locator("[data-pass-changed]").count()) throw new Error("the first chorus is marked");
    const lines = (await third.locator("[data-line]").allTextContents()).map((text) => text.replace(/[\u200b\s]+/g, " "));
    if (lines.length !== 1 || !lines[0].includes("been set free")) throw new Error(JSON.stringify(lines));
    // Am a tone up: Bm; the C left out.
    const chords = await third.locator("[data-chord]:not([data-chord=''])").evaluateAll((els) => els.map((el) => el.textContent.trim()).filter(Boolean));
    if (JSON.stringify(chords) !== JSON.stringify(["Bm"])) throw new Error(JSON.stringify(chords));
    // The first chorus as written.
    const firstChorus = await passes.nth(1).locator("[data-chord]:not([data-chord=''])").evaluateAll((els) => els.map((el) => el.textContent.trim()).filter(Boolean));
    if (JSON.stringify(firstChorus) !== JSON.stringify(["C", "G", "D", "C"])) throw new Error(JSON.stringify(firstChorus));
  });

  await step("back to the section as written in one click", async () => {
    await page.getByRole("radiogroup", { name: "Mode" }).getByRole("radio", { name: "Edit" }).click();
    await page.goto(`${WEB}/library/${song.id}?tab=editor`);
    await page.waitForLoadState("networkidle");
    await order().getByRole("listitem").nth(2).getByRole("button").click();
    await page.getByTestId("song-order-as-written").click();
    await order().locator("[data-pass-changed]").waitFor({ state: "detached" });
    if (first.chords.length !== 2) throw new Error("fixture");
  });
} finally {
  await browser.close();
}
finish();
