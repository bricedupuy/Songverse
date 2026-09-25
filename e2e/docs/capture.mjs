// Demo content and the docs' screenshots, in each language (run by
// screenshots.mjs, which starts a fresh copy of the app for it). The songs
// are in the public domain.
import { mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { API, WEB, api, signIn, sql, user } from "../lib/harness.mjs";

const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../apps/docs/src/assets/screenshots");
const STEMS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../fixtures/stems");

const SONGS = [
  {
    title: "Amazing Grace",
    artists: ["John Newton"],
    key: "G",
    tempo: 72,
    capo: 3,
    content: `{start_of_verse: Verse 1}
[G]Amazing [G7]grace! How [C]sweet the [G]sound
That [G]saved a [Em]wretch like [D]me!
I [G]once was [G7]lost, but [C]now am [G]found;
Was [Em]blind, but [D]now I [G]see.
{end_of_verse}

{start_of_verse: Verse 2}
'Twas [G]grace that [G7]taught my [C]heart to [G]fear,
And [G]grace my [Em]fears re[D]lieved;
How [G]precious [G7]did that [C]grace ap[G]pear
The [Em]hour I [D]first be[G]lieved!
{end_of_verse}
`,
  },
  {
    title: "Be Thou My Vision",
    artists: ["Traditional Irish"],
    key: "D",
    tempo: 84,
    content: `{start_of_verse}
[D]Be Thou my [G]Vision, O [D]Lord of my [A]heart;
[Bm]Naught be all [G]else to me, [D]save that Thou [A]art.
[G]Thou my best [A]Thought, by [Bm]day or by [G]night,
[D]Waking or [G]sleeping, Thy [D]presence my [A]light.
{end_of_verse}
`,
  },
  {
    title: "Holy, Holy, Holy",
    artists: ["Reginald Heber"],
    key: "D",
    tempo: 92,
    content: `{start_of_verse}
[D]Holy, holy, [Bm]holy! [G]Lord God Al[D]mighty!
Early in the [Bm]morning our [E]song shall rise to [A]Thee;
[D]Holy, holy, [Bm]holy, [G]merciful and [D]mighty!
[G]God in three [D]Persons, [Bm]bless[A]ed [D]Trinity!
{end_of_verse}
`,
  },
];

const LOCALES = {
  en: { user: "Alex Martin", email: "alex.martin@example.com", team: "Morning Band", set: "Sunday service", arrangement: "Sunday band", songbook: "Hymns", note: "Softly, piano only" },
  fr: { user: "Camille Durand", email: "camille.durand@example.com", team: "Groupe du matin", set: "Culte du dimanche", arrangement: "Groupe du dimanche", songbook: "Cantiques", note: "Doucement, piano seul" },
};

const nextSunday = () => {
  const date = new Date();
  date.setDate(date.getDate() + ((7 - date.getDay()) % 7 || 7));
  return date.toISOString().slice(0, 10);
};

const browser = await chromium.launch();
try {
  for (const [locale, text] of Object.entries(LOCALES)) {
    console.log(`\n${locale}`);
    const dir = path.join(OUT, locale);
    mkdirSync(dir, { recursive: true });

    // --- the demo content
    const me = await user(text.user);
    // A plain address rather than the harness's random one, since it shows on some pages.
    sql(`update "User" set locale='${locale}', email='${text.email}' where id='${me.id}'`);
    me.email = text.email;
    const team = await api(me, "POST", "/teams", { name: text.team });
    const songs = [];
    for (const song of SONGS) {
      songs.push(await api(me, "POST", "/song-versions", { ...song, language: "en", contentFormat: "CHORDPRO", teamId: team.id }));
    }
    const grace = songs[0];
    // Sung again at the end, a tone higher.
    const doc = (await api(me, "GET", `/song-versions/${grace.id}`)).documentJson;
    const flow = [...doc.flow, { id: "fi_last", sectionId: doc.sections[0].id, label: null, keyChange: { steps: 2, key: "A" }, note: null }];
    await api(me, "PATCH", `/song-versions/${grace.id}`, { flow, revision: doc.revision });

    // The band's usual arrangement: a tone up, capo 2, a replaced chord, a hidden one and a note.
    let arrangement = await api(me, "POST", `/song-versions/${grace.id}/arrangements`, { name: text.arrangement, teamId: team.id });
    const song = (await api(me, "GET", `/song-versions/${grace.id}`)).documentJson;
    const [verse1, verse2] = song.sections;
    const document = structuredClone(arrangement.document);
    document.defaults = { ...document.defaults, transposeSteps: 2, capo: 2, tempo: 76 };
    // Key changes are named in the arrangement's key (the editor renames them when its key changes).
    document.items[2].keyChange = { steps: 2, key: "B" };
    document.items[0].overrides = [
      { type: "chord", chordId: verse1.lines[0].chords[1].id, raw: "G/B" },
      { type: "performance_note", lineId: verse1.lines[0].id, note: text.note },
    ];
    document.items[1].overrides = [{ type: "hide_chord", chordId: verse2.lines[1].chords[1].id }];
    arrangement = await api(me, "PATCH", `/arrangements/${arrangement.id}`, { document, updatedAt: arrangement.updatedAt });
    arrangement = await api(me, "PATCH", `/arrangements/${arrangement.id}`, { isTeamDefault: true, updatedAt: arrangement.updatedAt });

    // Its stems, for the Practice player.
    for (const [file, stemPart] of [["Morning Light - Vocals.opus", "VOCALS"], ["03 drums.mp3", "DRUMS"], ["Morning Light - Bass.mp3", "BASS"], ["track4.opus", "KEYS"]]) {
      const form = new FormData();
      form.append("type", "AUDIO");
      form.append("stemPart", stemPart);
      form.append("file", new Blob([readFileSync(path.join(STEMS, file))], { type: "application/octet-stream" }), file);
      await fetch(`${API}/song-versions/${grace.id}/attachments`, { method: "POST", headers: { Authorization: `Bearer ${me.bearer}` }, body: form });
    }

    const set = await api(me, "POST", "/setlists", { name: text.set, eventDate: nextSunday(), teamId: team.id });
    for (const { id } of songs) await api(me, "POST", `/setlists/${set.id}/items`, { songVersionId: id });
    const items = (await api(me, "GET", `/setlists/${set.id}`)).items;

    const songbook = await api(me, "POST", "/songbooks", { name: text.songbook, kind: "NUMBERED", abbreviation: locale === "fr" ? "CA" : "HY" });
    for (const [i, { id }] of songs.entries()) await api(me, "POST", `/songbooks/${songbook.id}/entries`, { songVersionId: id, entryCode: String(i + 1) });

    // --- the screenshots
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: locale === "fr" ? "fr-FR" : "en-US", colorScheme: "light" });
    const page = await context.newPage();
    await signIn(page, me);
    const shoot = async (name, url, ready, options = {}) => {
      if (url) {
        await page.goto(`${WEB}${url}`);
        await page.waitForLoadState("networkidle");
      }
      if (ready) await ready();
      await page.waitForTimeout(300);
      const target = options.element ?? page;
      await target.screenshot({ path: path.join(dir, `${name}.jpg`), type: "jpeg", quality: 85, fullPage: options.fullPage ?? false });
      console.log(`  ${name}`);
    };

    await shoot("dashboard", "/dashboard");
    await shoot("library", "/library");
    await shoot("search", null, async () => {
      await page.keyboard.press("Control+k");
      // A letter in something of every kind in the demo content, in both languages.
      await page.getByRole("combobox").fill("n");
      await page.getByRole("group", { name: /Teams|Équipes/ }).waitFor();
    });
    await page.keyboard.press("Escape");
    await shoot("song-info", `/library/${grace.id}`);
    await shoot("song-editor", `/library/${grace.id}?tab=editor`, () => page.locator(".ProseMirror").waitFor());
    await shoot("song-order", null, null, { element: page.getByTestId("song-order") });
    await shoot("arrangements", `/library/${grace.id}?tab=arrangements`, () => page.getByTestId("arrangement-list").waitFor());
    await shoot("arrangement-editor", `/library/${grace.id}/arrangements/${arrangement.id}`, () => page.locator("[data-pass-editor]").first().waitFor(), { fullPage: true });
    await shoot("set", `/sets/${set.id}`, () => page.getByTestId("set-song-row").first().waitFor());
    await shoot("set-song", `/sets/${set.id}/songs/${items[0].id}`, () => page.locator("[data-pass]").first().waitFor(), { fullPage: true });
    // Live mode (it's remembered, so back to Edit for the rest).
    await shoot("live", `/sets/${set.id}/live/${items[0].id}`, () => page.locator("[data-pass]").first().waitFor());
    // Practice: the song's stems, one muted.
    await page.evaluate(() => localStorage.setItem("songverse.mode", "practice"));
    await shoot("stems", `/library/${grace.id}`, async () => {
      await page.getByTestId("stem-track").nth(3).waitFor();
      await page.getByTestId("stem-track").first().getByRole("button").first().click();
    }, { element: page.getByTestId("stem-player") });
    await page.evaluate(() => localStorage.setItem("songverse.mode", "edit"));
    await shoot("songbook", `/songbooks/${songbook.id}`, null, { fullPage: true });
    await shoot("team", `/teams/${team.id}`);
    // What the device keeps offline, once it has caught up (the set is coming up).
    await shoot("offline-storage", "/offline", () => page.getByText(/Last caught up|Dernière mise à jour/).waitFor({ timeout: 30_000 }));
    await context.close();
  }
} finally {
  await browser.close();
}
