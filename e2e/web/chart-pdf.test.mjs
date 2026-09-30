// A song's PDF in place of its chart (issue #152): a Chart / PDF switch on
// the Practice page and on the song's page in a set, the pages drawn with
// pdf.js. How a player reads a song (issue #155): the choice kept for them
// on the server - so another device, and Live, show the same - else their
// default from their settings.
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

await step("the set song's choice follows the player to another device, and into Live (issue #155)", async () => {
  await page.goto(`${WEB}/sets/${set.id}/songs/${item.id}`);
  await page.getByTestId("chart-view-pdf").click();
  await page.locator('[data-testid="pdf-view"][data-state="ready"]').waitFor({ timeout: 20000 });
  const other = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const tablet = await other.newPage();
  await signIn(tablet, me);
  await tablet.evaluate(() => localStorage.setItem("songverse.mode", "live"));
  await tablet.goto(`${WEB}/sets/${set.id}/live/${item.id}`);
  await tablet.getByTestId("live-view").waitFor();
  await tablet.locator('[data-testid="pdf-view"][data-state="ready"]').waitFor({ timeout: 20000 });
  if ((await tablet.getByTestId("pdf-page").count()) !== 2) throw new Error("not the PDF in Live");
  if (await tablet.getByTestId("live-structure").count()) throw new Error("the structure bar over a PDF");
  // Switched back in Live: the chart, there and in Practice.
  await tablet.getByTestId("chart-view-chart").click();
  await tablet.locator('[data-chord="G"]').first().waitFor();
  await other.close();
  await page.reload();
  await page.locator('[data-chord="G"]').first().waitFor();
  if (await page.getByTestId("pdf-view").count()) throw new Error("Practice still shows the PDF");
});

await step("the player's default (their settings): PDF for a song they haven't chosen for", async () => {
  // A song never opened: nothing chosen for it.
  const fresh = await api(me, "POST", "/song-versions", { title: `Fresh sheet ${stamp}`, language: "en", artists: ["Someone"], content: "[D]Hi\n", contentFormat: "CHORDPRO" });
  const f = new FormData();
  f.append("type", "PDF");
  f.append("file", new Blob([await doc.save()], { type: "application/pdf" }), "Fresh.pdf");
  await fetch(`${API}/song-versions/${fresh.id}/attachments`, { method: "POST", headers: { Authorization: `Bearer ${me.bearer}` }, body: f });
  await page.goto(`${WEB}/dashboard`);
  await page.getByLabel("Songs read as").selectOption("PDF");
  for (let i = 0; i < 50 && (await api(me, "GET", "/users/me")).liveView !== "PDF"; i++) await page.waitForTimeout(100);
  await page.goto(`${WEB}/library/${fresh.id}`);
  await page.locator('[data-testid="pdf-view"][data-state="ready"]').waitFor({ timeout: 20000 });
  // A song without a PDF: its chart all the same.
  await page.goto(`${WEB}/library/${plain.id}`);
  await page.getByTestId("practice-song").locator('[data-chord="G"]').first().waitFor();
  await api(me, "PATCH", "/users/me", { liveView: "CHART" });
});

await step("on a phone, the PDF's pages go edge to edge, in Practice and in Live", async () => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${WEB}/sets/${set.id}/songs/${item.id}`);
  await page.getByTestId("chart-view-pdf").click();
  await page.locator('[data-testid="pdf-view"][data-state="ready"]').waitFor({ timeout: 20000 });
  const edges = async () => {
    const box = await page.getByTestId("pdf-page").first().boundingBox();
    return { left: box.x, right: 390 - (box.x + box.width) };
  };
  let at = await edges();
  if (Math.abs(at.left) > 1 || Math.abs(at.right) > 1) throw new Error(`Practice: ${JSON.stringify(at)}`);
  await page.goto(`${WEB}/sets/${set.id}/live/${item.id}`);
  await page.locator('[data-testid="pdf-view"][data-state="ready"]').waitFor({ timeout: 20000 });
  at = await edges();
  if (Math.abs(at.left) > 1 || Math.abs(at.right) > 1) throw new Error(`Live: ${JSON.stringify(at)}`);
  // Nothing above it but the header: the song's title is the PDF's own.
  if (await page.getByTestId("live-song-top").isVisible()) throw new Error("the song's title over its PDF");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  if (overflow > 0) throw new Error(`${overflow}px sideways scroll`);
  await page.getByTestId("chart-view-chart").click();
  await page.setViewportSize({ width: 1280, height: 900 });
});

await step("no page errors", async () => {
  if (errors.length) throw new Error(errors.join(" | "));
});

await browser.close();
finish();
