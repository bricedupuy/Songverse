// Songs by chord progression (issue #204, phase 5 of #207): "1 5 6m 4" finds
// the songs whose chords go that way in any key - a section read as a loop,
// so 6m 4 1 5 too - only among songs the user can see; a song's own
// progressions and the songs that move most like it; a chart changed is
// searched as it is now.
import { chromium } from "playwright";
import { WEB, api, call, check, finish, signIn, stamp, stepper, user } from "../lib/harness.mjs";

let page;
const step = stepper(() => page);
const me = await user("Progression finder");
const other = await user("Someone else");

const song = (owner, title, key, chords) =>
  api(owner, "POST", "/song-versions", {
    title: `${title} ${stamp}`,
    language: "en",
    artists: ["Someone"],
    key,
    content: `{start_of_chorus}\n${chords.map((chord) => `[${chord}]la `).join("")}\n{end_of_chorus}\n`,
    contentFormat: "CHORDPRO",
  });
const pop = await song(me, "Pop in G", "G", ["G", "D/F#", "Em7", "C"]); // 1 5 6m 4
const loop = await song(me, "Loop in D", "D", ["Bm", "G", "D", "A"]); // 6m 4 1 5: the same loop
const blues = await song(me, "Blues in C", "C", ["C", "F", "G7"]); // 1 4 5
const theirs = await song(other, "Theirs", "E", ["E", "B", "C#m", "A"]); // 1 5 6m 4, but not mine to see

const titles = (found) => found.songs.map((one) => one.title);
let found = await api(me, "GET", `/progressions/search?q=${encodeURIComponent("1 5 6m 4")}`);
check("1 5 6m 4 finds both loops, in any key", titles(found).includes(pop.title) && titles(found).includes(loop.title), JSON.stringify(titles(found)));
check("not a song that doesn't go that way", !titles(found).includes(blues.title));
check("nor someone else's song", !titles(found).includes(theirs.title));
check("with the section it's in", found.songs.find((one) => one.id === pop.id)?.sections[0]?.degrees.join(" ") === "1 5 6m 4", JSON.stringify(found.songs[0]));
found = await api(me, "GET", `/progressions/search?q=${encodeURIComponent("I V vi IV")}`);
check("Roman numerals too", titles(found).includes(pop.title));
found = await api(me, "GET", `/progressions/search?q=hello`);
check("words aren't a progression", found.query === null && found.songs.length === 0);
check("a query is needed", (await call(me, "GET", "/progressions/search")).status === 400);

const alike = await api(me, "GET", `/progressions/songs/${pop.id}`);
check("a song's progressions", alike.sections.map((section) => section.degrees.join(" ")).join() === "1 5 6m 4", JSON.stringify(alike.sections));
check("the songs that move like it", alike.similar.some((one) => one.id === loop.id) && !alike.similar.some((one) => one.id === blues.id), JSON.stringify(alike.similar.map((one) => one.title)));
check("never someone else's", !alike.similar.some((one) => one.id === theirs.id));
check("only songs you can see", (await call(other, "GET", `/progressions/songs/${pop.id}`)).status === 403);

// The chart changed: searched as it is now.
await api(me, "PATCH", `/song-versions/${pop.id}`, { content: "{start_of_chorus}\n[G]la [C]la [D]la\n{end_of_chorus}\n", contentFormat: "CHORDPRO" });
found = await api(me, "GET", `/progressions/search?q=${encodeURIComponent("1 5 6m 4")}`);
check("a changed chart is searched as it is now", !titles(found).includes(pop.title) && titles(found).includes(loop.title), JSON.stringify(titles(found)));

const browser = await chromium.launch();
page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
await signIn(page, me);

await step("Library › Progressions: type a progression, get the songs", async () => {
  await page.goto(`${WEB}/library/progressions`);
  await page.getByTestId("progression-query").fill("6m 4 1 5");
  const results = page.getByTestId("progression-results");
  await results.getByText(loop.title).waitFor();
  await results.locator('[data-degrees="6m 4 1 5"]').first().waitFor();
});

await step("a song's page: its progressions and similar songs", async () => {
  await page.evaluate(() => localStorage.setItem("songverse.mode", "edit"));
  await page.goto(`${WEB}/library/${loop.id}`);
  const card = page.getByTestId("progressions-card");
  await card.locator('[data-degrees="6m 4 1 5"]').waitFor();
  await card.getByTestId("similar-progressions").waitFor();
});

await browser.close();
finish();
