// A version's own words and lines (issue #24), in the version editor:
// changing a line's words on one pass and going back to the song's, adding
// a line with its chords (and editing, removing it), moving a chord to
// another character; what's saved, and how it shows once reopened.
import { chromium } from "playwright";
import { WEB, api, finish, signIn, stamp, stepper, user } from "../lib/harness.mjs";

let page;
const step = stepper(() => page);
const me = await user("Singer");
const song = await api(me, "POST", "/song-versions", {
  title: `Own words ${stamp}`,
  language: "en",
  artists: ["Someone"],
  key: "G",
  content: "{start_of_verse}\n[G]Amazing grace how [D]sweet\n[Em]That saved a [C]wretch\n{end_of_verse}\n\n{start_of_chorus}\n[C]My chains are [G]gone\n{end_of_chorus}\n\n{chorus}\n",
  contentFormat: "CHORDPRO",
});
const version = await api(me, "POST", `/song-versions/${song.id}/arrangements`, { name: "Mine" });
const { documentJson } = await api(me, "GET", `/song-versions/${song.id}`);
const [verseLine1, verseLine2] = documentJson.sections[0].lines;
const [chorusLine] = documentJson.sections[1].lines;
const saved = async () => (await api(me, "GET", `/arrangements/${version.id}`)).document;

const browser = await chromium.launch();
page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
await signIn(page, me);
const pass = (n) => page.locator("[data-pass-editor]").nth(n);
const row = (n, lineId) => pass(n).locator(`[data-line-id="${lineId}"]`);
const save = async () => {
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.getByText("Saved.").waitFor();
};

await step("changing a line's words on one pass, its chords kept", async () => {
  await page.goto(`${WEB}/library/${song.id}/arrangements/${version.id}`);
  await page.waitForLoadState("networkidle");
  await row(0, verseLine1.id).getByRole("button", { name: "Change the words on this pass" }).click();
  const words = pass(0).getByLabel("Words on this pass", { exact: true });
  if ((await words.inputValue()) !== "Amazing grace how sweet") throw new Error(await words.inputValue());
  await words.fill("Amazing love how sweet");
  await pass(0).getByRole("button", { name: "Set words" }).click();
  await row(0, verseLine1.id).getByText("words changed").waitFor();
  await row(0, verseLine1.id).locator('[data-arr-chord="D"]').waitFor();
  await save();
  const doc = await saved();
  const lyric = doc.items[0].overrides.find((o) => o.type === "lyric");
  if (lyric?.text !== "Amazing love how sweet" || lyric.lineId !== verseLine1.id || lyric.chordPositions) throw new Error(JSON.stringify(doc.items[0].overrides));
});

await step("moving a chord to another character", async () => {
  await row(0, verseLine1.id).locator('[data-arr-chord="D"]').click();
  await page.getByTestId("chord-override").getByRole("button", { name: "Move" }).click();
  // "Amazing love how sweet": before the "l" of "love" (at 8).
  await page.getByTestId("chord-positions").locator('[data-at="8"]').click();
  await save();
  const lyric = (await saved()).items[0].overrides.find((o) => o.type === "lyric");
  const d = verseLine1.chords.find((c) => c.raw === "D");
  if (lyric?.chordPositions?.[d.id] !== 8) throw new Error(JSON.stringify(lyric));
});

await step("back to the song's words", async () => {
  await row(0, verseLine1.id).getByRole("button", { name: "Change the words on this pass" }).click();
  await pass(0).getByRole("button", { name: "Back to the song's words" }).click();
  await row(0, verseLine1.id).getByText("words changed").waitFor({ state: "detached" });
  await save();
  if ((await saved()).items[0].overrides.some((o) => o.type === "lyric")) throw new Error("still changed");
});

await step("a chord moved on the song's own words", async () => {
  await row(1, chorusLine.id).locator('[data-arr-chord="G"]').click();
  await page.getByTestId("chord-override").getByRole("button", { name: "Move" }).click();
  await page.getByTestId("chord-positions").getByRole("button", { name: "On “M”" }).click();
  await save();
  const lyric = (await saved()).items[1].overrides.find((o) => o.type === "lyric");
  const g = chorusLine.chords.find((c) => c.raw === "G");
  if (lyric?.text !== chorusLine.text || lyric.chordPositions?.[g.id] !== 0) throw new Error(JSON.stringify(lyric));
  // Only on that pass: the last chorus is as the song has it.
  if ((await saved()).items[2].overrides.length !== 0) throw new Error("the other chorus changed too");
});

let added;
await step("adding a line, with its chords, after another", async () => {
  await row(0, verseLine2.id).getByRole("button", { name: "Add a line after this one" }).click();
  await pass(0).getByLabel("New line").fill("[G]Sing it a[D]gain");
  await pass(0).getByRole("button", { name: "Add line" }).click();
  const addedRow = pass(0).locator("[data-added]");
  await addedRow.getByText("added").waitFor();
  await addedRow.locator('[data-arr-chord="D"]').waitFor();
  await save();
  const insert = (await saved()).items[0].overrides.find((o) => o.type === "insert_line");
  added = insert?.line;
  if (insert?.afterLineId !== verseLine2.id || added.text !== "Sing it again" || added.chords.map((c) => `${c.raw}@${c.at}`).join() !== "G@0,D@9" || !added.id.startsWith("ins_")) {
    throw new Error(JSON.stringify(insert));
  }
});

await step("its chord replaced like any other; the line edited, its chords keeping their IDs", async () => {
  const addedRow = pass(0).locator("[data-added]");
  await addedRow.locator('[data-arr-chord="D"]').click();
  await page.getByLabel("Replace with").fill("Bm");
  await page.getByRole("button", { name: "Replace", exact: true }).click();
  await addedRow.locator('[data-arr-chord="Bm"]').waitFor();
  await addedRow.getByRole("button", { name: "Edit this line" }).click();
  const input = pass(0).getByLabel("New line");
  if ((await input.inputValue()) !== "[G]Sing it a[D]gain") throw new Error(await input.inputValue());
  await input.fill("[G]Sing it once a[D]gain");
  await pass(0).getByRole("button", { name: "Save line" }).click();
  await save();
  const overrides = (await saved()).items[0].overrides;
  const insert = overrides.find((o) => o.type === "insert_line");
  if (insert.line.text !== "Sing it once again" || insert.line.chords[1].id !== added.chords[1].id || insert.line.chords[1].at !== 14) throw new Error(JSON.stringify(insert));
  if (!overrides.some((o) => o.type === "chord" && o.chordId === added.chords[1].id && o.raw === "Bm")) throw new Error("the replaced chord was lost");
});

await step("a line at the start; reopened, the editor shows the version as it is", async () => {
  await pass(1).getByRole("button", { name: "Add a line at the start" }).click();
  await pass(1).getByLabel("New line").fill("Everybody!");
  await pass(1).getByRole("button", { name: "Add line" }).click();
  await save();
  await page.reload();
  await page.waitForLoadState("networkidle");
  const texts = await pass(1).locator("[data-line-id] p").allInnerTexts();
  if (!texts[0].includes("Everybody!")) throw new Error(JSON.stringify(texts));
  await pass(0).locator("[data-added]").getByText("added").waitFor();
  const { problems } = await api(me, "GET", `/arrangements/${version.id}`);
  if (problems.length) throw new Error(JSON.stringify(problems));
});

await step("removing an added line takes its changes with it", async () => {
  await pass(0).locator("[data-added]").getByRole("button", { name: "Remove this line" }).click();
  await pass(0).locator("[data-added]").waitFor({ state: "detached" });
  await save();
  const overrides = (await saved()).items[0].overrides;
  if (overrides.length !== 0) throw new Error(JSON.stringify(overrides));
});

await browser.close();
finish();
