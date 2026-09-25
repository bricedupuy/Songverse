// The stem player (issue #64): audio files marked as parts of the song -
// by their names on upload, or by hand - played together in Practice, each
// part with its own mute and solo. MP3 and Opus files (e2e/fixtures/stems).
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { API, WEB, api, call, check, finish, signIn, stamp, stepper, user } from "../lib/harness.mjs";

const FIXTURES = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../fixtures/stems");
const fixture = (name) => path.join(FIXTURES, name);

let page;
const step = stepper(() => page);
const me = await user("Drummer");
const stranger = await user("Stranger");
const song = (title) => api(me, "POST", "/song-versions", { title, language: "en", artists: [`Band ${stamp}`], content: "[G]Hello [C]world\n", contentFormat: "CHORDPRO" });
const upload = async (songId, name, type, fields = {}, mime = "application/octet-stream") => {
  const form = new FormData();
  form.append("type", type);
  for (const [key, value] of Object.entries(fields)) form.append(key, value);
  form.append("file", new Blob([readFileSync(fixture(name))], { type: mime }), name);
  const res = await fetch(`${API}/song-versions/${songId}/attachments`, { method: "POST", headers: { Authorization: `Bearer ${me.bearer}` }, body: form });
  return { status: res.status, body: await res.json().catch(() => null) };
};

// --- the API
const apiSong = await song(`Stems API ${stamp}`);
let r = await upload(apiSong.id, "Morning Light - Vocals.opus", "AUDIO", { stemPart: "VOCALS" });
check("an .opus file with no audio type is recognised by its bytes, as a stem", r.status === 201 && r.body.mimeType === "audio/ogg" && r.body.stemPart === "VOCALS", JSON.stringify(r.body));
const vocals = r.body;
r = await upload(apiSong.id, "03 drums.mp3", "AUDIO", {}, "audio/mpeg");
check("without a part it's a plain recording", r.status === 201 && r.body.stemPart === null);
const drums = r.body;
r = await upload(apiSong.id, "03 drums.mp3", "AUDIO", { stemPart: "TRIANGLE" }, "audio/mpeg");
check("an unknown part is refused", r.status === 400, String(r.status));
r = await upload(apiSong.id, "03 drums.mp3", "OTHER", { stemPart: "DRUMS" });
check("only audio can be a stem", r.status === 400, String(r.status));
const other = (await upload(apiSong.id, "03 drums.mp3", "OTHER")).body;

const version = async () => (await api(me, "POST", "/offline/sync", {})).songs.find((s) => s.id === apiSong.id)?.version;
const before = await version();
r = await call(me, "PATCH", `/song-versions/${apiSong.id}/attachments/${drums.id}`, { stemPart: "DRUMS" });
check("a file's part can be set", r.status === 200 && r.body.stemPart === "DRUMS", JSON.stringify(r.body));
check("which changes the song's offline version", (await version()) !== before);
r = await call(me, "PATCH", `/song-versions/${apiSong.id}/attachments/${vocals.id}`, { stemPart: null });
check("and cleared", r.status === 200 && r.body.stemPart === null);
r = await call(me, "PATCH", `/song-versions/${apiSong.id}/attachments/${vocals.id}`, { stemPart: "KAZOO" });
check("an unknown part is refused", r.status === 400, String(r.status));
r = await call(me, "PATCH", `/song-versions/${apiSong.id}/attachments/${other.id}`, { stemPart: "BASS" });
check("a file that isn't audio can't be a stem", r.status === 400, String(r.status));
r = await call(stranger, "PATCH", `/song-versions/${apiSong.id}/attachments/${drums.id}`, { stemPart: "BASS" });
check("someone else can't change it", r.status === 403 || r.status === 404, String(r.status));
r = await call(me, "GET", `/song-versions/${apiSong.id}/attachments`);
check("the list gives each file's part", r.body.find((a) => a.id === drums.id)?.stemPart === "DRUMS" && r.body.find((a) => a.id === other.id)?.stemPart === null);

// --- the web app
const webSong = await song(`Stems ${stamp}`);
const set = await api(me, "POST", "/setlists", { name: `Stem set ${stamp}` });
const [item] = (await api(me, "POST", `/setlists/${set.id}/items`, { songVersionId: webSong.id })).items;

const browser = await chromium.launch();
page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
await signIn(page, me);
const partOf = (name) => page.getByLabel(`Stem for ${name}`);
const player = () => page.getByTestId("stem-player");
const track = (part) => player().locator(`[data-testid="stem-track"][data-part="${part}"]`);

await step("uploading stems: named parts are recognised, MP3 and Opus", async () => {
  await page.goto(`${WEB}/library/${webSong.id}?tab=audio`);
  await page.waitForLoadState("networkidle");
  await page.getByTestId("audio-input").setInputFiles(["Morning Light - Vocals.opus", "Morning Light - Bass.mp3", "03 drums.mp3", "track4.opus"].map(fixture));
  await page.getByTestId("audio-list").locator("li").nth(3).waitFor();
  const parts = {};
  for (const name of ["Morning Light - Vocals.opus", "Morning Light - Bass.mp3", "03 drums.mp3", "track4.opus"]) parts[name] = await partOf(name).inputValue();
  if (JSON.stringify(parts) !== JSON.stringify({ "Morning Light - Vocals.opus": "VOCALS", "Morning Light - Bass.mp3": "BASS", "03 drums.mp3": "DRUMS", "track4.opus": "" })) {
    throw new Error(JSON.stringify(parts));
  }
});

await step("a recording plays from a streamed link, and seeks", async () => {
  const ranges = [];
  page.on("response", (res) => {
    if (res.url().includes("/files/")) ranges.push(res.status());
  });
  const row = page.getByTestId("audio-list").locator("li").filter({ hasText: "Morning Light - Bass.mp3" });
  await row.getByRole("button", { name: "Play", exact: true }).click();
  const audio = row.locator("audio");
  await audio.waitFor();
  if (!(await audio.getAttribute("src")).includes("/files/")) throw new Error(await audio.getAttribute("src"));
  await page.waitForFunction((el) => el.duration > 3, await audio.elementHandle());
  await audio.evaluate((el) => {
    el.pause();
    el.currentTime = 2.5;
  });
  await page.waitForFunction((el) => el.readyState >= 2 && Math.abs(el.currentTime - 2.5) < 0.2, await audio.elementHandle());
  if (!ranges.includes(206)) throw new Error(`no partial response: ${ranges.join()}`);
});

await step("a link that stopped working is replaced, and it plays on", async () => {
  const drumsId = (await api(me, "GET", `/song-versions/${webSong.id}/attachments`)).find((a) => a.filename === "03 drums.mp3").id;
  const links = new Set();
  // The first link fails, as an expired one would; the ones after work.
  await page.route(
    (url) => {
      if (url.pathname !== `/files/${drumsId}`) return false;
      links.add(url.search);
      return links.size === 1;
    },
    (route) => route.fulfill({ status: 403, body: "expired" }),
  );
  const row = page.getByTestId("audio-list").locator("li").filter({ hasText: "03 drums.mp3" });
  await row.getByRole("button", { name: "Play", exact: true }).click();
  const audio = row.locator("audio");
  await audio.waitFor();
  await page.waitForFunction((el) => el.duration > 3, await audio.elementHandle());
  if (links.size !== 2) throw new Error(`${links.size} links`);
  if (await row.getByText("Couldn't load it.").count()) throw new Error("shown as failed");
});

await step("a file the name doesn't tell is assigned by hand", async () => {
  await partOf("track4.opus").selectOption({ label: "Piano and keys" });
  await page.waitForLoadState("networkidle");
  for (let i = 0; i < 25 && (await api(me, "GET", `/song-versions/${webSong.id}/attachments`)).find((a) => a.filename === "track4.opus")?.stemPart !== "KEYS"; i++) await page.waitForTimeout(200);
  if ((await partOf("track4.opus").inputValue()) !== "KEYS") throw new Error("not saved");
});

const chips = () => player().getByTestId("stem-chip");
const chip = (part) => player().locator(`[data-testid="stem-chip"][data-part="${part}"]`);
const floating = () => page.getByTestId("stem-return");
const time = async () => (await player().getByTestId("stem-time").textContent()).trim();
const seconds = (text) => {
  const [m, s] = text.split(" / ")[0].split(":").map(Number);
  return m * 60 + s;
};

await step("in Edit there's no player, just the way to Practice", async () => {
  if (await player().count()) throw new Error("a player in Edit");
  // Slowed down, to see them download.
  const slow = (route) => setTimeout(() => void route.continue(), 800);
  await page.route("**/attachments/*/download", slow);
  await page.getByRole("button", { name: "Switch to Practice to play the stems together." }).click();
  await player().waitFor();
  if ((await page.evaluate(() => document.documentElement.dataset.mode)) !== "practice") throw new Error("not Practice");
  // They start downloading as the page opens in Practice, with the progress along the top.
  await player().getByRole("progressbar", { name: /Loading the stems… \d+%/ }).waitFor();
  await page.locator('[data-testid="stem-player"][data-state="ready"]').waitFor();
  await page.unroute("**/attachments/*/download", slow);
});

await step("docked at the bottom, one row: play and a round button per part, with its instrument", async () => {
  await page.evaluate(() => window.scrollTo(0, 0));
  const box = await player().boundingBox();
  if (Math.abs(box.y + box.height - 900) > 2) throw new Error(`not at the bottom: ${JSON.stringify(box)}`);
  if ((await player().getAttribute("data-view")) !== "compact") throw new Error("not compact");
  if (box.height > 64) throw new Error(`${box.height}px high`);
  const parts = await chips().evaluateAll((els) => els.map((el) => `${el.dataset.part}:${el.getAttribute("title")}:${el.querySelector("svg")?.getAttribute("class")?.match(/lucide-([a-z-]+)/)?.[1]}`));
  if (parts.join() !== "VOCALS:Vocals:mic-vocal,DRUMS:Drums:drum,BASS:Bass:clef-bass,KEYS:Piano and keys:piano") throw new Error(parts.join());
  // Muted before anything has loaded.
  await chip("BASS").click();
});

await step("Play plays every part together; a round button mutes its part", async () => {
  await player().getByRole("button", { name: "Play", exact: true }).click();
  await page.locator('[data-testid="stem-player"][data-state="playing"]').waitFor();
  await page.waitForFunction(() => document.querySelector('[data-testid="stem-time"]')?.textContent?.startsWith("0:01"));
  if (!(await time()).endsWith("/ 0:20")) throw new Error(await time());
  await player().locator('[data-testid="stem-chip"][data-part="BASS"][data-audible="false"]').waitFor({ timeout: 1000 });
  await chip("BASS").click();
  await chip("VOCALS").click();
  await player().locator('[data-testid="stem-chip"][data-part="VOCALS"][aria-pressed="true"][data-audible="false"]').waitFor();
});

await step("expanded: a row per part with its waveform, mute and solo; the waveform seeks", async () => {
  await player().getByRole("button", { name: "Expand the player" }).click();
  await page.locator('[data-testid="stem-player"][data-view="expanded"]').waitFor();
  await player().getByTestId("stem-waveform").nth(3).waitFor();
  if (await player().getByText("can't be played").count()) throw new Error("a stem didn't decode");
  // Still muted from the compact row.
  await track("VOCALS").and(page.locator('[data-audible="false"]')).waitFor();
  // Its round button toggles here too.
  await track("KEYS").getByRole("button", { name: "Mute Piano and keys" }).click();
  await track("KEYS").and(page.locator('[data-audible="false"]')).waitFor();
  await track("KEYS").getByRole("button", { name: "Mute Piano and keys" }).click();
  await track("KEYS").and(page.locator('[data-audible="true"]')).waitFor();
  await player().getByRole("button", { name: "Solo Drums" }).click();
  const audible = await player().getByTestId("stem-track").evaluateAll((rows) => rows.map((row) => `${row.dataset.part}:${row.dataset.audible}`));
  if (audible.join() !== "VOCALS:false,DRUMS:true,BASS:false,KEYS:false") throw new Error(audible.join());
  await player().getByRole("button", { name: "Solo Drums" }).click();
  await track("BASS").and(page.locator('[data-audible="true"]')).waitFor();
  const wave = await track("BASS").getByTestId("stem-waveform").boundingBox();
  await page.mouse.click(wave.x + wave.width * 0.6, wave.y + wave.height / 2);
  await page.waitForFunction(() => {
    const [m, s] = document.querySelector('[data-testid="stem-time"]').textContent.split(" / ")[0].split(":").map(Number);
    return m * 60 + s >= 11;
  });
});

await step("it plays on elsewhere, with a button back to the song", async () => {
  const before = seconds(await time());
  await page.getByRole("link", { name: "Sets", exact: true }).first().click();
  await page.waitForURL(`${WEB}/sets`);
  await floating().getByText(`Stems ${stamp}`).waitFor();
  if (await player().count()) throw new Error("the dock followed");
  await page.waitForTimeout(1500);
  await floating().getByRole("button", { name: `Back to Stems ${stamp}` }).click();
  await page.waitForURL(`**/library/${webSong.id}`);
  await page.locator('[data-testid="stem-player"][data-state="playing"]').waitFor();
  if (seconds(await time()) < before + 1) throw new Error(`${await time()}, was ${before}s`);
  if (await floating().count()) throw new Error("the floating button stayed");
});

await step("leaving Practice keeps it playing; the floating button pauses it", async () => {
  await page.getByRole("radiogroup", { name: "Mode" }).getByRole("radio", { name: "Edit" }).click();
  await floating().waitFor();
  if (await player().count()) throw new Error("a dock in Edit");
  await floating().getByRole("button", { name: "Pause", exact: true }).click();
  await floating().waitFor({ state: "detached" });
  await page.getByRole("radiogroup", { name: "Mode" }).getByRole("radio", { name: "Practice" }).click();
  await page.locator('[data-testid="stem-player"][data-state="ready"]').waitFor();
  if (seconds(await time()) < 11) throw new Error(`lost its place: ${await time()}`);
});

await step("at the end it stops and goes back to the start", async () => {
  await player().getByLabel("Position").fill("19");
  await player().getByRole("button", { name: "Play", exact: true }).click();
  await page.locator('[data-testid="stem-player"][data-state="playing"]').waitFor();
  await page.locator('[data-testid="stem-player"][data-state="ready"]').waitFor({ timeout: 10_000 });
  if ((await time()) !== "0:00 / 0:20") throw new Error(await time());
});

await step("a set's song has the player too, in Practice, as it was left (expanded)", async () => {
  await page.goto(`${WEB}/sets/${set.id}/songs/${item.id}`);
  await page.waitForLoadState("networkidle");
  await track("KEYS").waitFor();
  await player().getByRole("button", { name: "Play", exact: true }).click();
  await page.locator('[data-testid="stem-player"][data-state="playing"]').waitFor();
  await player().getByRole("button", { name: "Pause", exact: true }).click();
  await page.locator('[data-testid="stem-player"][data-state="ready"]').waitFor();
  await player().getByRole("button", { name: "Minimize the player" }).click();
  await chips().first().waitFor();
});

await step("one row: a soloed part's button takes it out of the solo, the others stay soloed", async () => {
  await player().getByRole("button", { name: "Expand the player" }).click();
  await track("DRUMS").getByRole("button", { name: "Solo Drums" }).last().click();
  // The headphones; the round button says the same while a solo is on.
  await track("BASS").getByRole("button", { name: "Solo Bass" }).last().click();
  await player().getByRole("button", { name: "Minimize the player" }).click();
  // The ring has room: nothing around the buttons cuts it off.
  const [row, drums] = await Promise.all([chips().first().locator("..").boundingBox(), chip("DRUMS").boundingBox()]);
  if (drums.y - 4 < row.y || drums.y + drums.height + 4 > row.y + row.height) throw new Error(`the ring is cut: ${JSON.stringify({ row, drums })}`);
  await player().getByRole("button", { name: "Stop soloing Drums" }).click();
  const audible = async () => (await chips().evaluateAll((els) => els.map((el) => `${el.dataset.part}:${el.dataset.audible}`))).join();
  if ((await audible()) !== "VOCALS:false,DRUMS:false,BASS:true,KEYS:false") throw new Error(await audible());
  // A part outside the solo joins it.
  await player().getByRole("button", { name: "Solo Vocals" }).click();
  if ((await audible()) !== "VOCALS:true,DRUMS:false,BASS:true,KEYS:false") throw new Error(await audible());
  await player().getByRole("button", { name: "Stop soloing Vocals" }).click();
  await player().getByRole("button", { name: "Stop soloing Bass" }).click();
  if ((await audible()) !== "VOCALS:true,DRUMS:true,BASS:true,KEYS:true") throw new Error(await audible());
  // Back to muting.
  await chip("DRUMS").and(page.getByRole("button", { name: "Mute Drums" })).click();
  if ((await audible()) !== "VOCALS:true,DRUMS:false,BASS:true,KEYS:true") throw new Error(await audible());
  await chip("DRUMS").click();
});

await step("through an <audio> element (as on iPhone, to play on with the screen locked)", async () => {
  await page.evaluate(() => localStorage.setItem("songverse.stems.output", "element"));
  await page.goto(`${WEB}/library/${webSong.id}`);
  await page.waitForLoadState("networkidle");
  await player().getByRole("button", { name: "Play", exact: true }).click();
  await page.locator('[data-testid="stem-player"][data-state="playing"]').waitFor();
  await page.waitForFunction(() => document.querySelector('[data-testid="stem-time"]')?.textContent?.startsWith("0:02"));
  const session = await page.evaluate(() => [navigator.mediaSession.playbackState, navigator.mediaSession.metadata?.title]);
  if (session.join() !== `playing,Stems ${stamp}`) throw new Error(`lock screen: ${session.join()}`);
  await player().getByRole("button", { name: "Pause", exact: true }).click();
  if ((await page.evaluate(() => navigator.mediaSession.playbackState)) !== "paused") throw new Error("still playing on the lock screen");
  await page.evaluate(() => localStorage.removeItem("songverse.stems.output"));
});

await step("on a phone it fits", async () => {
  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto(`${WEB}/library/${webSong.id}`);
  await page.waitForLoadState("networkidle");
  await chips().nth(3).waitFor();
  const box = await player().boundingBox();
  if (box.x < 0 || box.x + box.width > 360 || Math.abs(box.y + box.height - 740) > 2) throw new Error(JSON.stringify(box));
  // Clear of a phone's rounded corners.
  const play = await player().getByRole("button", { name: "Play", exact: true }).boundingBox();
  if (play.x < 16 || box.y + box.height - (play.y + play.height) < 12) throw new Error(`the Play button is at ${JSON.stringify(play)}`);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  if (overflow > 0) throw new Error(`${overflow}px sideways scroll`);
});

await browser.close();
finish();
