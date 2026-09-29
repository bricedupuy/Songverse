// A chart read from a PDF's text (issue #124): dropped on a new song, its
// words and chords fill the text box, each chord on the syllable printed
// under it; a PDF with no text (a scan) says so. The PDFs are made here
// with pdf-lib, so where each chord sits is known exactly.
import { chromium } from "playwright";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { WEB, api, finish, signIn, stamp, stepper, user } from "../lib/harness.mjs";

let page;
const step = stepper(() => page);
const me = await user("Pdf importer");

/** A chord chart as a typeset PDF: each chord set over the start of its syllable, in Helvetica. */
async function chartPdf(fontName = StandardFonts.Helvetica) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(fontName);
  const pdfPage = pdf.addPage([595, 842]);
  const size = 12;
  let y = 780;
  const line = (text, x = 60) => pdfPage.drawText(text, { x, y, size, font });
  const chordsOver = (lyric, chords) => {
    for (const [chord, syllable] of chords) line(chord, 60 + font.widthOfTextAtSize(lyric.slice(0, syllable), size));
    y -= 16;
    line(lyric);
    y -= 16;
  };
  line("Verse 1");
  y -= 16;
  chordsOver("Amazing grace how sweet the sound", [["G", 3], ["D", "Amazing grace ".length], ["G/B", "Amazing grace how sweet the ".length]]);
  chordsOver("That saved a wretch like me", [["C", 0], ["G", "That saved a ".length]]);
  y -= 16;
  line("Chorus");
  y -= 16;
  chordsOver("My chains are gone", [["Em7", 3], ["Cadd9", "My chains are ".length]]);
  return Buffer.from(await pdf.save());
}

/** A "scan": a page with a picture of text but no text. */
async function scannedPdf() {
  const pdf = await PDFDocument.create();
  const pdfPage = pdf.addPage([595, 842]);
  pdfPage.drawRectangle({ x: 60, y: 700, width: 300, height: 40, color: rgb(0.2, 0.2, 0.2) });
  return Buffer.from(await pdf.save());
}

const browser = await chromium.launch();
page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
await signIn(page, me);

await step("a PDF with text: its words and chords fill the text box, each chord on its syllable", async () => {
  await page.goto(`${WEB}/library/new`);
  await page.waitForLoadState("networkidle");
  await page.getByTestId("source-file-input").setInputFiles({ name: "amazing-grace.pdf", mimeType: "application/pdf", buffer: await chartPdf() });
  await page.locator('[data-testid="pdf-state"][data-state="read"]').waitFor();
  const text = await page.locator("#song-content").inputValue();
  const expected = ["Verse 1", "Ama[G]zing grace [D]how sweet the [G/B]sound", "[C]That saved a [G]wretch like me", "", "Chorus", "My [Em7]chains are [Cadd9]gone"].join("\n");
  if (text !== expected) throw new Error(`got:\n${text}`);
  await page.getByText("check the chords landed on the right syllables").waitFor();
  await page.getByText(/Detected: ChordPro/).waitFor();
});

await step("saved, the song has those chords where they were printed, and keeps the PDF", async () => {
  await page.fill("#song-title", `From a PDF ${stamp}`);
  await page.click("#song-artists");
  await page.keyboard.type("John Newton;");
  await page.getByRole("button", { name: "Save song" }).click();
  await page.waitForURL(/\/library\/(?!new)[a-z0-9]+/);
  const id = page.url().split("/library/")[1].split("?")[0];
  const song = await api(me, "GET", `/song-versions/${id}`);
  const [verse, chorus] = song.documentJson.sections;
  const first = verse.lines[0];
  const chordsAt = (line) => line.chords.map((chord) => `${chord.raw}@${chord.at}`).join(" ");
  if (verse.type !== "verse" || chorus.type !== "chorus" || first.text !== "Amazing grace how sweet the sound" || chordsAt(first) !== "G@3 D@14 G/B@28" || chordsAt(chorus.lines[0]) !== "Em7@3 Cadd9@14") {
    throw new Error(JSON.stringify(song.documentJson.sections));
  }
  const files = await api(me, "GET", `/song-versions/${id}/attachments`);
  if (files.length !== 1 || files[0].type !== "PDF") throw new Error(JSON.stringify(files));
});

await step("in other fonts too (Times, Courier): the chords land on the same syllables", async () => {
  for (const font of [StandardFonts.TimesRoman, StandardFonts.Courier]) {
    await page.goto(`${WEB}/library/new`);
    await page.waitForLoadState("networkidle");
    await page.getByTestId("source-file-input").setInputFiles({ name: "grace.pdf", mimeType: "application/pdf", buffer: await chartPdf(font) });
    await page.locator('[data-testid="pdf-state"][data-state="read"]').waitFor();
    const text = await page.locator("#song-content").inputValue();
    if (!text.includes("Ama[G]zing grace [D]how sweet the [G/B]sound") || !text.includes("My [Em7]chains are [Cadd9]gone")) throw new Error(`${font}:\n${text}`);
  }
});

await step("a PDF with no text (a scan) is kept, and says to paste the words", async () => {
  await page.goto(`${WEB}/library/new`);
  await page.waitForLoadState("networkidle");
  await page.getByTestId("source-file-input").setInputFiles({ name: "scan.pdf", mimeType: "application/pdf", buffer: await scannedPdf() });
  await page.locator('[data-testid="pdf-state"][data-state="noText"]').waitFor();
  await page.getByText("This PDF has no text to read (a scan?): paste the words below.").waitFor();
  if ((await page.locator("#song-content").inputValue()) !== "") throw new Error("the text box was filled");
});

await step("no page errors", async () => {
  if (errors.length) throw new Error(errors.join("\n"));
});

await browser.close();
finish();
