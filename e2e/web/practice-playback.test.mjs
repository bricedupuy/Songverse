// Playback in Practice without stems (issue #66): a song's latest whole
// recording in the same dock, or with no audio at all its YouTube video,
// through YouTube's embedded player - stubbed here, CI can't reach YouTube.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { sidebarGo, API, WEB, api, finish, signIn, stamp, stepper, user } from "../lib/harness.mjs";

const FIXTURES = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../fixtures/stems");
// YouTube's IFrame API, as far as Songverse uses it: a player that keeps time.
const FAKE_YT = `
window.YT = { Player: class {
  constructor(el, o) {
    this.o = o; this.t = 0; this.state = -1;
    const d = document.createElement("div");
    d.dataset.testid = "fake-youtube"; d.dataset.video = o.videoId; d.dataset.host = o.host || "";
    d.style.cssText = "width:100%;height:100%;background:#234";
    el.replaceWith(d); this.el = d;
    setTimeout(() => { o.events.onReady && o.events.onReady(); if (o.playerVars && o.playerVars.autoplay) this.playVideo(); }, 50);
  }
  emit(s) { this.state = s; this.el.dataset.state = String(s); this.o.events.onStateChange && this.o.events.onStateChange({ data: s }); }
  playVideo() { if (this.state === 1) return; this.start = Date.now() - this.t * 1000; this.emit(1); }
  pauseVideo() { this.t = this.getCurrentTime(); this.emit(2); }
  seekTo(s) { this.t = s; if (this.state === 1) this.start = Date.now() - s * 1000; }
  getCurrentTime() { return this.state === 1 ? (Date.now() - this.start) / 1000 : this.t; }
  getDuration() { return 212; }
  cueVideoById(id) { this.el.dataset.video = id; this.t = 0; this.emit(5); }
  loadVideoById(id) { this.cueVideoById(id); this.playVideo(); }
  destroy() { this.el.remove(); }
} };
window.onYouTubeIframeAPIReady && window.onYouTubeIframeAPIReady();
`;

let page;
const step = stepper(() => page);
const me = await user("Player");
const song = (title) => api(me, "POST", "/song-versions", { title, language: "en", artists: ["Someone"], key: "G", tempo: 72, content: "[G]Hello\n", contentFormat: "CHORDPRO" });
const upload = async (songId, name, fields = {}) => {
  const form = new FormData();
  form.append("type", "AUDIO");
  for (const [key, value] of Object.entries(fields)) form.append(key, value);
  form.append("file", new Blob([readFileSync(path.join(FIXTURES, name))], { type: "audio/mpeg" }), name);
  await fetch(`${API}/song-versions/${songId}/attachments`, { method: "POST", headers: { Authorization: `Bearer ${me.bearer}` }, body: form });
};
const youtube = (songId, id) => api(me, "PUT", `/song-versions/${songId}/links/YOUTUBE`, { url: `https://www.youtube.com/watch?v=${id}` });

const recorded = await song(`Recorded ${stamp}`);
await upload(recorded.id, "Morning Light - Bass.mp3");
const video = await song(`Video ${stamp}`);
await youtube(video.id, "dQw4w9WgXcQ");
// Audio of its own wins over YouTube.
const both = await song(`Both ${stamp}`);
await upload(both.id, "03 drums.mp3");
await youtube(both.id, "abcdefghijk");

const browser = await chromium.launch();
page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
await signIn(page, me);
await page.route("https://www.youtube.com/iframe_api", (route) => route.fulfill({ contentType: "text/javascript", body: FAKE_YT }));
await page.route("https://i.ytimg.com/**", (route) => route.fulfill({ status: 404, body: "" }));
await page.evaluate(() => localStorage.setItem("songverse.mode", "practice"));
const stems = () => page.getByTestId("stem-player");
const dock = () => page.getByTestId("youtube-dock");
const host = () => page.getByTestId("youtube-host");
const view = () => host().getAttribute("data-view");

await step("no stems: the latest recording plays in the dock, without parts", async () => {
  await page.goto(`${WEB}/library/${recorded.id}`);
  await page.waitForLoadState("networkidle");
  await stems().getByTestId("stem-recording-name").getByText("Morning Light - Bass.mp3").waitFor();
  if (await stems().getByTestId("stem-chip").count()) throw new Error("part buttons for a whole recording");
  await stems().getByRole("button", { name: "Play", exact: true }).click();
  await page.locator('[data-testid="stem-player"][data-state="playing"]').waitFor();
  await stems().getByRole("button", { name: "Expand the player" }).click();
  await stems().locator('[data-testid="stem-track"][data-part="MIX"]').getByText("Recording", { exact: true }).waitFor();
  if (await stems().getByRole("button", { name: /^Solo/ }).count()) throw new Error("a solo button for a whole recording");
  await stems().getByRole("button", { name: "Pause", exact: true }).click();
  await stems().getByRole("button", { name: "Minimize the player" }).click();
});

await step("no audio at all: the YouTube video, shown in the dock (no tracking cookies)", async () => {
  await page.goto(`${WEB}/library/${video.id}`);
  await page.waitForLoadState("networkidle");
  await dock().waitFor();
  if (await stems().count()) throw new Error("a stem player without audio");
  await page.locator('[data-testid="fake-youtube"][data-video="dQw4w9WgXcQ"]').waitFor({ state: "attached" });
  if ((await page.getByTestId("fake-youtube").getAttribute("data-host")) !== "https://www.youtube-nocookie.com") throw new Error("not youtube-nocookie");
  await page.waitForFunction(() => document.querySelector('[data-testid="youtube-host"]')?.dataset.view === "docked");
  // Laid over the dock's box, at least 200x200 as YouTube requires.
  await page.waitForTimeout(100);
  const [anchor, box] = await Promise.all([dock().getByTestId("youtube-anchor").boundingBox(), host().boundingBox()]);
  if (Math.abs(anchor.x - box.x) > 1 || Math.abs(anchor.y - box.y) > 1 || box.width < 200 || box.height < 200) throw new Error(JSON.stringify({ anchor, box }));
});

await step("Play plays the video, and the time follows", async () => {
  await dock().getByRole("button", { name: "Play", exact: true }).click();
  await page.locator('[data-testid="youtube-dock"][data-state="playing"]').waitFor();
  await page.waitForFunction(() => document.querySelector('[data-testid="youtube-time"]')?.textContent?.startsWith("0:01"));
  if (!(await dock().getByTestId("youtube-time").textContent()).endsWith("/ 3:32")) throw new Error(await dock().getByTestId("youtube-time").textContent());
});

await step("elsewhere it plays on in a corner, with a way back", async () => {
  await sidebarGo(page, "Sets");
  await page.waitForURL(`${WEB}/sets`);
  await page.waitForFunction(() => document.querySelector('[data-testid="youtube-host"]')?.dataset.view === "mini");
  const box = await host().boundingBox();
  if (box.x + box.width < 1280 - 40 || box.y + box.height < 900 - 40 || box.height < 200) throw new Error(`not in the corner: ${JSON.stringify(box)}`);
  if ((await page.getByTestId("fake-youtube").getAttribute("data-state")) !== "1") throw new Error("stopped");
  await host().getByRole("button", { name: `Back to Video ${stamp}` }).click();
  await page.waitForURL(`**/library/${video.id}`);
  await page.waitForFunction(() => document.querySelector('[data-testid="youtube-host"]')?.dataset.view === "docked");
  await page.locator('[data-testid="youtube-dock"][data-state="playing"]').waitFor();
});

await step("one thing plays at a time: the stems stop YouTube", async () => {
  await sidebarGo(page, "Library");
  await page.getByRole("row").getByText(`Recorded ${stamp}`, { exact: true }).click(); // in the list, not the home's shelves
  await page.waitForURL(`**/library/${recorded.id}`);
  if ((await view()) !== "mini") throw new Error(`the video isn't in the corner: ${await view()}`);
  await stems().getByRole("button", { name: "Play", exact: true }).click();
  await page.locator('[data-testid="stem-player"][data-state="playing"]').waitFor();
  await page.waitForFunction(() => document.querySelector('[data-testid="youtube-host"]')?.dataset.view === "hidden");
  if ((await page.getByTestId("fake-youtube").getAttribute("data-state")) !== "2") throw new Error("YouTube still playing");
  // …and YouTube stops them.
  await page.goto(`${WEB}/library/${video.id}`);
  await page.waitForLoadState("networkidle");
  await dock().getByRole("button", { name: "Play", exact: true }).click();
  await page.locator('[data-testid="youtube-dock"][data-state="playing"]').waitFor();
  await dock().getByRole("button", { name: "Pause", exact: true }).click();
  await page.locator('[data-testid="youtube-dock"][data-state="ready"]').waitFor();
});

await step("a song with its own audio plays that, not its YouTube video", async () => {
  await page.goto(`${WEB}/library/${both.id}`);
  await page.waitForLoadState("networkidle");
  await stems().getByTestId("stem-recording-name").getByText("03 drums.mp3").waitFor();
  if (await dock().count()) throw new Error("a YouTube dock too");
});

await step("in Edit, no player", async () => {
  await page.getByRole("radiogroup", { name: "Mode" }).getByRole("radio", { name: "Edit" }).click();
  await stems().waitFor({ state: "detached" });
  await page.goto(`${WEB}/library/${video.id}`);
  await page.waitForLoadState("networkidle");
  if (await dock().count()) throw new Error("a YouTube dock in Edit");
});

await browser.close();
finish();
