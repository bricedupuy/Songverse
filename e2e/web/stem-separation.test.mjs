// Stem separation in the web app (issue #63), against a fake Demucs API
// (e2e/lib/fake-demucs.mjs): Admin > Stem separation set up and its
// connection tested; a user given the Stem separation role; on a song's Audio tab,
// "Separate into stems" with 6 parts, the quick stems arriving as a
// multitrack, then the finer ones in their place.
import { chromium } from "playwright";
import { API, WEB, api, call, finish, signIn, sql, stamp, stepper, user } from "../lib/harness.mjs";
import { FAKE_DEMUCS_KEY, FAKE_DEMUCS_URL, startFakeDemucs, toneWav } from "../lib/fake-demucs.mjs";

let page;
const step = stepper(() => page);
const demucs = await startFakeDemucs();
const admin = await user("Stems page admin");
sql(`update "User" set "isGlobalAdmin"=true where id='${admin.id}'`);
const singer = await user("Stems page singer");

const song = await api(singer, "POST", "/song-versions", { title: `Split in the app ${stamp}`, language: "en", artists: ["Band"], content: "[G]Hello\n", contentFormat: "CHORDPRO" });
const form = new FormData();
form.append("type", "AUDIO");
form.append("file", new Blob([toneWav(300, 2)], { type: "audio/wav" }), "Full mix.wav");
await fetch(`${API}/song-versions/${song.id}/attachments`, { method: "POST", headers: { Authorization: `Bearer ${singer.bearer}` }, body: form });

const browser = await chromium.launch();
try {
  page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

  await step("not set up, or not allowed: no button", async () => {
    await signIn(page, singer);
    await page.goto(`${WEB}/library/${song.id}?tab=audio`);
    await page.getByText("Full mix.wav").first().waitFor();
    await page.waitForTimeout(1000);
    if (await page.getByTestId("separate-stems").count()) throw new Error("offered before it's set up");
    await page.context().clearCookies();
  });

  await step("Admin > Stem separation: the server saved, its connection tested", async () => {
    await signIn(page, admin);
    await page.goto(`${WEB}/admin/stem-separation`);
    await page.getByRole("heading", { name: "Stem separation" }).waitFor();
    await page.getByTestId("stem-source").getByText("Nothing configured").waitFor();
    await page.getByLabel("API address").fill(FAKE_DEMUCS_URL);
    await page.getByLabel("API key").fill(FAKE_DEMUCS_KEY);
    await page.getByTestId("stem-save").click();
    await page.getByTestId("stem-source").getByText("saved in the database").waitFor();
    if ((await page.getByLabel("API key").inputValue()) !== "") throw new Error("the key shown back");
    await page.getByTestId("stem-test").click();
    await page.getByTestId("stem-test-result").getByText("htdemucs_6s").waitFor();
  });

  await step("Admin > Users: the Stem separation role given to them (issue #160)", async () => {
    await page.goto(`${WEB}/admin/users`);
    await page.getByPlaceholder("Search by name or email…").fill(singer.email);
    const row = page.getByRole("row").filter({ hasText: singer.email });
    await row.getByRole("button", { name: /Stems page singer/ }).click();
    await page.getByRole("menuitem", { name: "Roles…" }).click();
    await page.getByTestId("roles-dialog-list").getByLabel(/Stem separation/).check();
    await page.getByTestId("roles-dialog-save").click();
    await row.getByTestId("user-roles").getByText("Stem separation").waitFor();
    await page.context().clearCookies();
  });

  await step("Audio tab: separated into 6 parts, the quick stems as a multitrack", async () => {
    await signIn(page, singer);
    await page.goto(`${WEB}/library/${song.id}?tab=audio`);
    await page.getByTestId("separate-stems").click();
    await page.getByTestId("separate-options").getByText("Only separate a recording you have the rights").waitFor();
    await page.getByTestId("separate-parts-6").check();
    await page.getByTestId("separate-start").click();
    await page.getByTestId("separations").getByText("Full mix.wav, 6 parts").waitFor();
    await page.getByTestId("separation-FAST_READY").getByText("a finer version is on its way").waitFor({ timeout: 30_000 });
    if (demucs.received.at(-1).model !== "htdemucs_6s") throw new Error(JSON.stringify(demucs.received.at(-1)));
    await page.getByText("Separated (Demucs)").first().waitFor({ timeout: 15_000 });
  });

  await step("the finer stems in their place: Ready", async () => {
    const jobId = sql(`select "jobId" from "StemSeparation" where "songVersionId"='${song.id}'`);
    await demucs.completeHq(jobId);
    // The page looks again every minute while only the finer stems are awaited.
    await page.getByTestId("separation-COMPLETED").getByText("Ready").waitFor({ timeout: 90_000 });
    const files = (await api(singer, "GET", `/song-versions/${song.id}/attachments`)).filter((file) => file.multitrackName === "Separated (Demucs)");
    if (files.length !== 6) throw new Error(JSON.stringify(files.map((file) => file.stemPart)));
  });
} finally {
  await call(admin, "DELETE", "/admin/stem-separation");
  await browser.close();
  await demucs.close();
}
finish();
