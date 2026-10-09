// Linked copies in the editor (issue #205): the editor shows the song in
// the order it's sung; "Duplicate (linked)" adds a copy of a section that
// follows it, locked. It can be transposed by itself, and "Edit this copy"
// changes it by differences from the section - a line left out, words
// replaced or removed (shown greyed out), chords changed or left out - while
// it keeps following the section otherwise. Changed copies are marked *;
// "Make unique" turns one into a section of its own. Sections taken out of
// the song's order sit at the end, under "Not in the song order".
import { chromium } from "playwright";
import { WEB, api, finish, signIn, stamp, stepper, user } from "../lib/harness.mjs";

let page;
const step = stepper(() => page);
const me = await user("Linked copies");
const song = await api(me, "POST", "/song-versions", {
  title: `Copies ${stamp}`,
  language: "en",
  artists: ["Band"],
  key: "C",
  content: "{start_of_verse}\n[C]Amazing grace\n{end_of_verse}\n{start_of_chorus}\n[C]My chains are [G]gone\n[D]I've been set [C]free\n[F]Your mercy reigns\n{end_of_chorus}\n",
  contentFormat: "CHORDPRO",
});
const stored = async () => (await api(me, "GET", `/song-versions/${song.id}`)).documentJson;
const doc = await stored();
const chorus = doc.sections.find((section) => section.type === "chorus");
const [first, second, third] = chorus.lines;
const [d, cFree] = second.chords;

const browser = await chromium.launch();
try {
  page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
  await signIn(page, me);
  const editor = () => page.getByTestId("structured-editor");
  const copy = () => editor().getByTestId("linked-copy");
  const order = () => page.getByTestId("song-order");
  const save = async (check) => {
    await page.getByRole("button", { name: "Save song" }).first().click();
    for (let i = 0; i < 40; i++) {
      const found = await stored();
      if (check(found)) return found;
      await page.waitForTimeout(250);
    }
    throw new Error(`not saved: ${JSON.stringify((await stored()).flow)}`);
  };

  await step("Duplicate (linked): a locked copy right after the chorus, linked to it", async () => {
    await page.goto(`${WEB}/library/${song.id}?tab=editor`);
    await page.waitForLoadState("networkidle");
    await editor().locator('[data-section-type="chorus"]').getByRole("button", { name: "Chorus actions" }).click();
    await page.getByTestId("section-duplicate-linked").click();
    await copy().waitFor();
    await copy().getByText("Linked to Chorus").waitFor();
    // In the editor's order: verse, chorus, its copy.
    const blocks = await editor().locator(":scope > [data-node-view-wrapper], :scope > section, :scope > div").evaluateAll((els) => els.map((el) => (el.matches("[data-linked-pass]") || el.querySelector("[data-linked-pass]") ? "copy" : el.getAttribute("data-section-type") ?? el.querySelector("[data-section-type]")?.getAttribute("data-section-type"))));
    if (JSON.stringify(blocks.filter(Boolean)) !== JSON.stringify(["verse", "chorus", "copy"])) throw new Error(JSON.stringify(blocks));
    // Locked: no text to type into.
    if (await copy().locator("input").count()) throw new Error("editable while locked");
    await order().getByRole("listitem").nth(2).getByLabel("Linked copy").waitFor();
  });

  await step("transposed by itself, a tone up", async () => {
    await copy().getByTestId("linked-transpose-up").click();
    await copy().getByTestId("linked-transpose-up").click();
    await copy().getByTestId("linked-transpose").getByText("+2").waitFor();
    // D sounds as E on the copy.
    await copy().locator(`[data-copy-line="${second.id}"]`).getByText("E", { exact: true }).waitFor();
  });

  await step("Edit this copy: a line left out, a word replaced, words removed greyed out, chords changed and left out - marked *", async () => {
    await copy().getByTestId("linked-edit").click();
    await copy().getByTestId(`linked-line-${first.id}`).click();
    await copy().getByTestId(`linked-words-${second.id}`).fill("I've been made free");
    await copy().getByTestId(`linked-chord-${d.id}`).fill("Am");
    await copy().getByTestId(`linked-chord-hide-${cFree.id}`).click();
    await copy().locator(`[data-copy-line="${first.id}"][data-hidden]`).waitFor();
    await copy().locator(`[data-copy-line="${second.id}"] [data-word="removed"]`).getByText("set").waitFor();
    await copy().locator(`[data-copy-line="${second.id}"] [data-word="added"]`).getByText("made").waitFor();
    await copy().locator("[data-pass-changed]").waitFor();
    await order().locator("[data-pass-changed]").waitFor();
    await copy().getByTestId("linked-edit").click();
  });

  await step("still linked: a change to the chorus reaches the copy", async () => {
    const line = editor().locator(`[data-section-type="chorus"] p[data-sv-line]`).nth(2);
    await line.click();
    await page.keyboard.press("End");
    await page.keyboard.type(" forever");
    await copy().locator(`[data-copy-line="${third.id}"]`).getByText(/forever/).waitFor();
  });

  await step("saved: the copy's pass with its changes; the chorus as written", async () => {
    const saved = await save((found) => found.flow[2]?.transpose === 2);
    const pass = saved.flow[2];
    if (pass.sectionId !== chorus.id || JSON.stringify(pass.hiddenLines) !== JSON.stringify([first.id])) throw new Error(JSON.stringify(pass));
    if (pass.lyrics?.[0]?.text !== "I've been made free") throw new Error(JSON.stringify(pass.lyrics));
    const chords = Object.fromEntries(pass.chords.map((change) => [change.chordId, change.raw]));
    if (chords[d.id] !== "Am" || chords[cFree.id] !== null) throw new Error(JSON.stringify(pass.chords));
    const section = saved.sections.find((one) => one.id === chorus.id);
    if (section.lines[1].text !== "I've been set free" || !section.lines[2].text.endsWith("forever")) throw new Error(JSON.stringify(section.lines.map((one) => one.text)));
  });

  await step("the chart: the copy as it's sung, marked *", async () => {
    await page.getByRole("radiogroup", { name: "Mode" }).getByRole("radio", { name: "Practice" }).click();
    const passes = page.getByTestId("song-chart").locator("[data-pass]");
    await passes.nth(2).waitFor();
    await passes.nth(2).locator("[data-pass-changed]").waitFor();
    const lines = (await passes.nth(2).locator("[data-line]").allTextContents()).map((text) => text.replace(/[​\s]+/g, " "));
    if (lines.length !== 2 || !lines[0].includes("made free") || !lines[1].includes("forever")) throw new Error(JSON.stringify(lines));
    // Am a tone up: Bm; the C left out.
    const chords = await passes.nth(2).locator("[data-line]").first().locator("[data-chord]:not([data-chord=''])").evaluateAll((els) => els.map((el) => el.textContent.trim()).filter(Boolean));
    if (JSON.stringify(chords) !== JSON.stringify(["Bm"])) throw new Error(JSON.stringify(chords));
    await page.getByRole("radiogroup", { name: "Mode" }).getByRole("radio", { name: "Edit" }).click();
  });

  await step("Make unique: a section of its own, its changes written in", async () => {
    await page.goto(`${WEB}/library/${song.id}?tab=editor`);
    await page.waitForLoadState("networkidle");
    await copy().getByRole("button", { name: "Chorus copy actions" }).click();
    await page.getByTestId("linked-make-unique").click();
    await copy().waitFor({ state: "detached" });
    if ((await editor().locator('[data-section-type="chorus"]').count()) !== 2) throw new Error("not a section of its own");
    const saved = await save((found) => found.sections.length === 3);
    const pass = saved.flow[2];
    const own = saved.sections.find((one) => one.id === pass.sectionId);
    if (own.id === chorus.id || pass.transpose || pass.lyrics || pass.hiddenLines || pass.chords) throw new Error(JSON.stringify(pass));
    if (own.lines.length !== 2 || own.lines[0].text !== "I've been made free" || own.lines[0].chords.map((chord) => chord.raw).join() !== "Bm") throw new Error(JSON.stringify(own.lines));
  });

  await step("taken out of the song order: at the end, under its heading", async () => {
    await editor().locator('[data-section-type="verse"]').getByRole("button", { name: "Verse actions" }).click();
    await page.getByTestId("section-toggle-sung").click();
    await editor().getByTestId("unsung-heading").waitFor();
    await editor().locator('[data-section-type="verse"][data-unsung]').waitFor();
    const saved = await save((found) => !found.flow.some((item) => item.sectionId === doc.sections[0].id));
    if (!saved.sections.some((one) => one.id === doc.sections[0].id)) throw new Error("the verse was deleted");
  });
} finally {
  await browser.close();
}
finish();
