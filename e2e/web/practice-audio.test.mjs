// What Practice loads first (issue #182): a song's whole recording when it
// has one - one file, quick to load - in the player minimised, with a button
// to switch to its multitrack, whose parts only load then; the choice is
// remembered for the song. The minimised player has no part's controls.
import { chromium } from "playwright";
import { API, WEB, api, finish, signIn, stamp, stepper, user } from "../lib/harness.mjs";

let page;
const step = stepper(() => page);
const me = await user("Listener");

/** A few seconds of a tone, as a WAV at 8 kHz (128 kbps: kept as it is). */
function wav(frequency, seconds = 4, rate = 8000) {
  const samples = seconds * rate;
  const buffer = Buffer.alloc(44 + samples * 2);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + samples * 2, 4);
  buffer.write("WAVEfmt ", 8);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(rate, 24);
  buffer.writeUInt32LE(rate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(samples * 2, 40);
  for (let i = 0; i < samples; i++) buffer.writeInt16LE(Math.round(Math.sin((2 * Math.PI * frequency * i) / rate) * 3000), 44 + i * 2);
  return buffer;
}
async function upload(songId, name, part) {
  const form = new FormData();
  form.append("type", "AUDIO");
  if (part) form.append("stemPart", part);
  form.append("file", new Blob([wav(part ? 220 : 330)], { type: "audio/wav" }), name);
  return (await fetch(`${API}/song-versions/${songId}/attachments`, { method: "POST", headers: { Authorization: `Bearer ${me.bearer}` }, body: form })).json();
}

const song = await api(me, "POST", "/song-versions", { title: `Both ${stamp}`, language: "en", artists: ["Band"], content: "[G]Line\n", contentFormat: "CHORDPRO" });
const mix = await upload(song.id, "Full mix.wav", null);
const stems = [await upload(song.id, "Both - Drums.wav", "DRUMS"), await upload(song.id, "Both - Bass.wav", "BASS")];

const browser = await chromium.launch();
try {
  page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await signIn(page, me);
  await page.evaluate(() => localStorage.setItem("songverse.mode", "practice"));
  const player = () => page.getByTestId("stem-player");
  const downloads = new Set();
  page.on("request", (request) => {
    const match = /\/attachments\/([^/]+)\/download/.exec(request.url());
    if (match) downloads.add(match[1]);
  });

  await step("the recording first, minimised: only its file loaded, a button to the multitrack", async () => {
    await page.goto(`${WEB}/library/${song.id}`);
    await page.locator('[data-testid="stem-player"][data-state="ready"]').waitFor({ timeout: 20000 });
    if ((await player().getAttribute("data-view")) !== "compact") throw new Error("not minimised");
    await player().getByTestId("stem-recording-name").getByText("Full mix.wav").waitFor();
    if ([...downloads].join() !== mix.id) throw new Error(`downloaded ${[...downloads].join()}`);
    await player().getByTestId("stem-switch-multitrack").getByText("Multitrack").waitFor();
    if ((await player().getByTestId("stem-chip").count()) || (await player().getByTestId("stem-volume").count())) throw new Error("a part's controls minimised");
  });

  await step("switched to the multitrack: its parts loaded then, still minimised; remembered for the song", async () => {
    await player().getByTestId("stem-switch-multitrack").click();
    await player().getByTestId("stem-part-count").getByText("2 parts").waitFor({ timeout: 20000 });
    await player().getByTestId("stem-recording-name").getByText("Original stems").waitFor();
    await page.locator('[data-testid="stem-player"][data-state="ready"]').waitFor({ timeout: 20000 });
    if (!stems.every((file) => downloads.has(file.id))) throw new Error(`downloaded ${[...downloads].join()}`);
    if ((await player().getAttribute("data-view")) !== "compact") throw new Error("expanded");
    if (await player().getByTestId("stem-switch-multitrack").count()) throw new Error("still offering the multitrack");
    await page.reload();
    await player().getByTestId("stem-part-count").getByText("2 parts").waitFor({ timeout: 20000 });
  });

  await step("the recording is offered beside the multitracks, to go back to", async () => {
    const picker = player().getByTestId("stem-multitrack");
    const options = await picker.locator("option").allTextContents();
    if (options.join() !== "Recording,Original stems") throw new Error(options.join());
    await picker.selectOption({ label: "Recording" });
    await player().getByTestId("stem-recording-name").getByText("Full mix.wav").waitFor({ timeout: 20000 });
    await player().getByTestId("stem-switch-multitrack").waitFor();
  });

  await step("a song with only stems: they load, minimised", async () => {
    const only = await api(me, "POST", "/song-versions", { title: `Stems only ${stamp}`, language: "en", artists: ["Band"], content: "[G]Line\n", contentFormat: "CHORDPRO" });
    await upload(only.id, "Only - Drums.wav", "DRUMS");
    await page.goto(`${WEB}/library/${only.id}`);
    await page.locator('[data-testid="stem-player"][data-state="ready"]').waitFor({ timeout: 20000 });
    if ((await player().getAttribute("data-view")) !== "compact") throw new Error("not minimised");
    await player().getByTestId("stem-part-count").getByText("1 part").waitFor();
    if (await player().getByTestId("stem-switch-multitrack").count()) throw new Error("a switch with no recording");
  });
} finally {
  await browser.close();
}
finish();
