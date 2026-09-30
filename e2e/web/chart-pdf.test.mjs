// A song's PDF in place of its chart (issue #152): a Chart / PDF switch on
// the Practice page and on the song's page in a set, the pages drawn with
// pdf.js, the choice remembered for the song.
import { chromium } from "playwright";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { API, WEB, api, finish, signIn, stamp, stepper, user } from "../lib/harness.mjs";

let page;
const step = stepper(() => page);
const me = await user("Pdf reader");

const song = await api(me, "POST", "/song-versions", { title: `Sheet ${stamp}`, language: "en", artists: ["Someone"], content: "[G]Hello [C]world\n", contentFormat: "CHORDPRO" });
const plain = await api(me, "POST", "/song-versions", { title: `No sheet ${stamp}`, language: "en", artists: ["Someone"], content: "[G]Hello\n", contentFormat: "CHORDPRO" });

// A two-page PDF: black text on white, so the pages drawn aren't blank.
const doc = await PDFDocument.create();
const font = await doc.embedFont(StandardFonts.Helvetica);
for (const n of [1, 2]) doc.addPage([595, 842]).drawText(`Sheet page ${n}`, { x: 60, y: 760, size: 48, font, color: rgb(0, 0, 0) });
const form = new FormData();
form.append("type", "PDF");
form.append("file", new Blob([await doc.save()], { type: "application/pdf" }), "Sheet.pdf");
await fetch(`${API}/song-versions/${song.id}/attachments`, { method: "POST", headers: { Authorization: `Bearer ${me.bearer}` }, body: form });
const set = await api(me, "POST", "/setlists", { name: `Sheets ${stamp}` });
const [item] = (await api(me, "POST", `/setlists/${set.id}/items`, { songVersionId: song.id })).items;

const browser = await chromium.launch();
page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
await signIn(page, me);
await page.evaluate(() => localStorage.setItem("songverse.mode", "practice"));

/** How many of a canvas's pixels aren't white: something drawn on it. */
const inked = (canvas) => canvas.evaluate((el) => {
  const data = el.getContext("2d").getImageData(0, 0, el.width, el.height).data;
  let dark = 0;
  for (let i = 0; i < data.length; i += 16) if (data[i] < 128) dark++;
  return dark;
});

await step("a song without a PDF has no switch; its chart as ever", async () => {
  await page.goto(`${WEB}/library/${plain.id}`);
  await page.getByTestId("practice-song").locator('[data-chord="G"]').first().waitFor();
  if (await page.getByTestId("chart-view").count()) throw new Error("a switch without a PDF");
});

await step("with a PDF: Chart / PDF; the PDF's pages drawn, as wide as the page", async () => {
  await page.goto(`${WEB}/library/${song.id}`);
  const practice = page.getByTestId("practice-song");
  await practice.locator('[data-chord="G"]').first().waitFor();
  await practice.getByTestId("chart-view-pdf").click();
  await page.locator('[data-testid="pdf-view"][data-state="ready"]').waitFor({ timeout: 20000 });
  const pages = practice.getByTestId("pdf-page");
  if ((await pages.count()) !== 2) throw new Error(`${await pages.count()} pages`);
  if ((await inked(pages.first())) < 50) throw new Error("a blank page");
  const width = (await pages.first().boundingBox()).width;
  const room = (await practice.boundingBox()).width;
  if (width < room - 4) throw new Error(`${width}px of ${room}px`);
  if (await practice.locator('[data-chord="G"]').count()) throw new Error("the chart still shown");
});

await step("remembered for the song; back to the chart", async () => {
  await page.reload();
  await page.locator('[data-testid="pdf-view"][data-state="ready"]').waitFor({ timeout: 20000 });
  await page.getByTestId("chart-view-chart").click();
  await page.getByTestId("practice-song").locator('[data-chord="G"]').first().waitFor();
});

await step("on its page in a set too", async () => {
  await page.goto(`${WEB}/sets/${set.id}/songs/${item.id}`);
  await page.getByTestId("chart-view-pdf").click();
  await page.locator('[data-testid="pdf-view"][data-state="ready"]').waitFor({ timeout: 20000 });
  if ((await page.getByTestId("pdf-page").count()) !== 2) throw new Error("not its pages");
  await page.getByTestId("chart-view-chart").click();
});

await step("no page errors", async () => {
  if (errors.length) throw new Error(errors.join(" | "));
});

await browser.close();
finish();
