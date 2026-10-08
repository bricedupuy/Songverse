// The search command (issue #48): a search box at the top of every mode (a
// magnifying glass on a phone), Ctrl K, results grouped by kind, and in
// Live a song that isn't in the set pulled up full screen.
import { chromium } from "playwright";
import { WEB, api, call, check, finish, signIn, stepper, tag, user } from "../lib/harness.mjs";

let page;
const step = stepper(() => page);
const me = await user("Searcher");
const team = await api(me, "POST", "/teams", { name: `Band ${tag}` });
// Letters only, and this run's own: "HY 42" style references.
const abbr = [...tag].map((digit) => "ABCDEFGHIJ"[Number(digit)]).join("");
const songbook = await api(me, "POST", "/songbooks", { name: `Hymnal ${tag}`, kind: "NUMBERED", abbreviation: abbr });
const planned = await api(me, "POST", "/song-versions", {
  title: `Planned ${tag}`,
  language: "en",
  artists: ["Someone"],
  content: "[G]In the set\n",
  contentFormat: "CHORDPRO",
});
const unplanned = await api(me, "POST", "/song-versions", {
  title: `Called ${tag}`,
  language: "en",
  artists: [`Singer ${tag}`],
  key: "D",
  content: "{start_of_chorus}\n[D]Not in the [A]set but [G]called\n{end_of_chorus}\n",
  contentFormat: "CHORDPRO",
});
const date = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
const set = await api(me, "POST", "/setlists", { name: `Pâques ${tag}`, eventDate: date });
const [item] = (await api(me, "POST", `/setlists/${set.id}/items`, { songVersionId: planned.id })).items;

await api(me, "POST", `/songbooks/${songbook.id}/entries`, { songVersionId: unplanned.id, entryCode: "7" });
const outsider = await user("Outsider");
let r;

// Numbers that also find 581, 582... and 158, 258... (issue #213): this songbook's own, by its abbreviation.
const numbered = {};
for (const code of ["58", "580", "581", "582", "583", "584", "585", "586", "587", "588", "589", "5800", "5801", "5802", "5803", "5804", "5805", "5806", "5807", "5808", "5809", "5810", "158", "258"]) {
  const song = await api(me, "POST", "/song-versions", { title: `Number ${code} ${abbr}`, language: "en", artists: ["Someone"], content: "[G]Words\n", contentFormat: "CHORDPRO" });
  await api(me, "POST", `/songbooks/${songbook.id}/entries`, { songVersionId: song.id, entryCode: code });
  numbered[code] = song;
}
const ranked = (body) => body.map((hit) => `${hit.match}:${hit.entryCode}`).join(" ");
r = await call(me, "GET", `/songbook-entries?q=${encodeURIComponent(`${abbr} 58`)}`);
check(
  "a number: exactly it, then 20 starting with it in number order, then containing it",
  ranked(r.body) === ["exact:58", ...["580", "581", "582", "583", "584", "585", "586", "587", "588", "589", "5800", "5801", "5802", "5803", "5804", "5805", "5806", "5807", "5808", "5809"].map((code) => `prefix:${code}`), "contains:158", "contains:258"].join(" "),
  ranked(r.body),
);
r = await call(me, "GET", `/songbook-entries?q=${encodeURIComponent(`${abbr} 58`)}&more=true`);
check("Show more: the rest of them", r.body.some((hit) => hit.entryCode === "5810"), ranked(r.body));
r = await call(me, "GET", `/songbook-entries?q=${encodeURIComponent(`${abbr} 5`)}`);
check("one digit finds only itself", r.body.length === 0, ranked(r.body));
r = await call(me, "GET", `/song-versions?q=${encodeURIComponent(`Number 158 ${abbr}`)}&references=true`);
check("a song's songbook references, when asked", JSON.stringify(r.body.items[0]?.songbookReferences) === JSON.stringify([`${abbr} 158`]), JSON.stringify(r.body.items[0]));
r = await call(me, "GET", `/song-versions?q=${encodeURIComponent(`Number 158 ${abbr}`)}`);
check("not otherwise", r.body.items[0] && !("songbookReferences" in r.body.items[0]));

// --- songbook references (the API)
r = await call(me, "GET", `/songbook-entries?q=${encodeURIComponent(`${abbr} 7`)}`);
check("an entry by its songbook's abbreviation and number", r.status === 200 && r.body.length === 1 && r.body[0].songVersionId === unplanned.id && r.body[0].entryCode === "7", JSON.stringify(r.body));
r = await call(me, "GET", `/songbook-entries?q=${abbr}7`);
check("run together", r.body.length === 1 && r.body[0].title === `Called ${tag}`);
r = await call(me, "GET", `/songbook-entries?q=${encodeURIComponent(`hymnal ${tag} 7`)}`);
check("by part of the songbook's name", r.body.length === 1);
r = await call(me, "GET", `/songbook-entries?q=${encodeURIComponent(`${abbr} 8`)}`);
check("a number it doesn't have", r.body.length === 0);
r = await call(outsider, "GET", `/songbook-entries?q=${encodeURIComponent(`${abbr} 7`)}`);
check("not in someone else's songbook", r.status === 200 && r.body.length === 0);

const browser = await chromium.launch();
page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
await signIn(page, me);

const trigger = () => page.getByTestId("command-search");
const dialog = () => page.getByRole("dialog", { name: "Search songs, sets, songbooks and teams" });
const field = () => dialog().getByRole("combobox");
const group = (name) => dialog().getByRole("group", { name, exact: true });

await step("on a wide screen it looks like a search box, beside the mode switch", async () => {
  await page.goto(`${WEB}/library`);
  await page.waitForLoadState("networkidle");
  const box = await trigger().boundingBox();
  if (box.width < 150 || box.y > 56) throw new Error(`the search box is at ${JSON.stringify(box)}`);
  await trigger().getByText("Search…").waitFor();
  const modes = await page.getByRole("radiogroup", { name: "Mode" }).boundingBox();
  if (box.x > modes.x) throw new Error("not beside (left of) the mode switch");
});

await step("empty, it lists the sets coming up", async () => {
  await trigger().click();
  await field().waitFor();
  await group("Sets").getByRole("option", { name: new RegExp(`Pâques ${tag}`) }).waitFor();
  await page.keyboard.press("Escape");
  await dialog().waitFor({ state: "detached" });
});

await step("Ctrl K opens it; results grouped: songs, sets, songbooks, teams", async () => {
  await page.keyboard.press("Control+k");
  await field().fill(tag);
  await group("Songs").getByRole("option", { name: new RegExp(`Called ${tag}`) }).waitFor();
  await group("Songs").getByRole("option", { name: new RegExp(`Planned ${tag}`) }).waitFor();
  await group("Sets").getByRole("option", { name: new RegExp(`Pâques ${tag}`) }).waitFor();
  await group("Songbooks").getByRole("option", { name: new RegExp(`Hymnal ${tag}`) }).waitFor();
  await group("Teams").getByRole("option", { name: new RegExp(`Band ${tag}`) }).waitFor();
});

await step("names match without their accents; a song by its artist", async () => {
  await field().fill(`paques ${tag}`);
  await group("Sets").getByRole("option", { name: new RegExp(`Pâques ${tag}`) }).waitFor();
  await field().fill(`Singer ${tag}`);
  await group("Songs").getByRole("option", { name: new RegExp(`Called ${tag}`) }).waitFor();
  await field().fill(`nothing like this ${tag}`);
  await dialog().getByText(`Nothing found for “nothing like this ${tag}”`).waitFor();
});

await step("the arrow keys and Enter open a result; in Edit a song opens its page", async () => {
  await field().fill(`Hymnal ${tag}`);
  await group("Songbooks").getByRole("option").first().waitFor();
  await page.keyboard.press("Enter");
  await page.waitForURL(`**/songbooks/${songbook.id}`);
  await trigger().click();
  await field().fill(`Called ${tag}`);
  await group("Songs").getByRole("option").first().waitFor();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("Enter");
  await page.waitForURL(`**/library/${unplanned.id}`);
  await dialog().waitFor({ state: "detached" });
});

await step("a songbook number finds its entry, first; Enter opens the song", async () => {
  await page.goto(`${WEB}/library`);
  await page.waitForLoadState("networkidle");
  await page.keyboard.press("Control+k");
  await field().fill(`${abbr} 7`);
  const entry = group("In songbooks").getByRole("option", { name: new RegExp(`${abbr} 7 — Called ${tag}`) });
  await entry.waitFor();
  if ((await dialog().getByRole("option").first().textContent()) !== (await entry.textContent())) throw new Error("the entry isn't first");
  await page.keyboard.press("Enter");
  await page.waitForURL(`**/library/${unplanned.id}`);
});

await step("numbers starting with it, then containing it, with Show more; songs show where they are (issue #213)", async () => {
  await page.keyboard.press("Control+k");
  await field().fill(`${abbr} 58`);
  await group("In songbooks").getByRole("option", { name: new RegExp(`${abbr} 58 — Number 58 ${abbr}`) }).waitFor();
  const starting = group("Numbers starting with 58");
  await starting.getByRole("option").first().waitFor();
  if ((await starting.getByRole("option").count()) !== 20) throw new Error(`${await starting.getByRole("option").count()} starting with 58`);
  const containing = group("Numbers containing 58");
  const contained = (await containing.getByRole("option").allTextContents()).map((text) => text.split(" — ")[0]);
  if (contained.join("|") !== `${abbr} 158|${abbr} 258`) throw new Error(contained.join("|"));
  await dialog().getByTestId("search-entries-more").click();
  await starting.getByRole("option", { name: new RegExp(`${abbr} 5810 `) }).waitFor();
  // Songs found by title say where they are.
  await field().fill(`Number 258 ${abbr}`);
  await group("Songs").getByTestId("search-song-references").getByText(`${abbr} 258`).waitFor();
  await page.keyboard.press("Escape");
});

await step("the song's page gives its songbook reference, to copy", async () => {
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"], { origin: WEB });
  await page.goto(`${WEB}/library/${unplanned.id}`);
  await page.waitForLoadState("networkidle");
  const membership = page.getByTestId("songbook-membership").filter({ hasText: `Hymnal ${tag}` });
  await membership.getByTestId("songbook-reference").getByText(`${abbr} 7`, { exact: true }).waitFor();
  await membership.getByRole("button", { name: "Copy" }).click();
  await membership.getByRole("button", { name: "Copied" }).waitFor();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  if (copied !== `Called ${tag} — ${abbr} 7`) throw new Error(`copied ${JSON.stringify(copied)}`);
});

await step("in Live, a song that isn't in the set opens full screen, and × comes back", async () => {
  await page.goto(`${WEB}/sets/${set.id}/live/${item.id}`);
  await page.getByTestId("live-view").waitFor();
  await page.waitForLoadState("networkidle");
  await trigger().click();
  // Their own set: Enter opens a song without adding it; Play next would add it (issue #199).
  await dialog().getByText(/Enter opens a song full screen without adding it/).waitFor();
  // "Hymn 7!": by its number.
  await field().fill(`${abbr} 7`);
  await group("In songbooks").getByRole("option", { name: new RegExp(`Called ${tag}`) }).click();
  await page.waitForURL(`**/library/${unplanned.id}/live?**`);
  await page.getByRole("heading", { name: `Called ${tag}` }).waitFor();
  await page.locator('[data-chord="D"]').first().waitFor();
  if ((await page.evaluate(() => document.documentElement.dataset.mode)) !== "live") throw new Error("not Live");
  if (await page.getByTestId("live-next").count()) throw new Error("a song on its own has a Next button");
  // Another one from there still comes back to the set.
  await trigger().click();
  await field().fill(`Planned ${tag}`);
  await group("Songs").getByRole("option").first().waitFor();
  await page.keyboard.press("Enter");
  await page.waitForURL(`**/library/${planned.id}/live?**`);
  await page.getByRole("button", { name: "Back" }).click();
  await page.waitForURL(`**/sets/${set.id}/live/${item.id}`);
  await page.getByRole("heading", { name: `Planned ${tag}` }).waitFor();
});

await step("on a phone: a magnifying glass, the dialog fits", async () => {
  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto(`${WEB}/library`);
  await page.waitForLoadState("networkidle");
  const box = await trigger().boundingBox();
  if (box.width > 40 || box.x + box.width > 360) throw new Error(`the button is ${JSON.stringify(box)}`);
  if (await trigger().getByText("Search…").isVisible()) throw new Error("the phone shows the search box text");
  await trigger().click();
  await field().fill(tag);
  await group("Songs").getByRole("option").first().waitFor();
  const panel = await dialog().boundingBox();
  if (panel.x < 0 || panel.x + panel.width > 360) throw new Error(`the dialog is ${JSON.stringify(panel)}`);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  if (overflow > 0) throw new Error(`${overflow}px sideways scroll`);
});

await browser.close();
finish();
