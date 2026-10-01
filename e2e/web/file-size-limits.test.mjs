// Admin > Storage > File size limits (issue #163): a type's limit saved and
// reset; the song's Files tab saying the limit, and refusing a file over its
// type's before sending it.
import { chromium } from "playwright";
import { WEB, api, call, finish, signIn, sql, stamp, stepper, user } from "../lib/harness.mjs";

let page;
const step = stepper(() => page);
const admin = await user("Sizes page admin");
sql(`update "User" set "isGlobalAdmin"=true where id='${admin.id}'`);
const song = await api(admin, "POST", "/song-versions", { title: `Sizes page ${stamp}`, language: "en", artists: ["Band"] });

const browser = await chromium.launch();
try {
  page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await signIn(page, admin);

  await step("Admin > Storage: the PDF limit set to 1 MB, the others kept", async () => {
    await page.goto(`${WEB}/admin/storage`);
    const card = page.getByTestId("file-size-limits");
    await card.getByText("Built-in: 50 MB").waitFor();
    await page.getByLabel("PDF (MB)").fill("1");
    await page.getByLabel("Other (MB)").fill("30");
    await page.getByTestId("file-size-save").click();
    await card.getByRole("button", { name: "Reset" }).first().waitFor();
    const saved = await api(admin, "GET", "/admin/storage/file-size-limits");
    if (saved.limitsMb.PDF !== 1 || saved.limitsMb.OTHER !== 30 || saved.custom.join() !== "PDF,OTHER") throw new Error(JSON.stringify(saved));
  });

  await step("the Files tab says the limit, and refuses a PDF over it before sending it", async () => {
    await page.goto(`${WEB}/library/${song.id}?tab=files`);
    await page.getByText("Up to 30 MB each, depending on the type.").waitFor();
    await page.locator('input[type="file"]').first().setInputFiles({ name: "Big.pdf", mimeType: "application/pdf", buffer: Buffer.alloc(1.5 * 1024 * 1024, 1) });
    await page.getByText("Big.pdf is too large: PDF files can be up to 1 MB.").waitFor();
    if ((await api(admin, "GET", `/song-versions/${song.id}/attachments`)).length !== 0) throw new Error("sent anyway");
  });

  await step("reset to the built-in limit", async () => {
    await page.goto(`${WEB}/admin/storage`);
    const card = page.getByTestId("file-size-limits");
    // One at a time: the second once the first is saved.
    const resets = card.getByRole("button", { name: "Reset" });
    await resets.first().click();
    await page.waitForFunction(() => [...document.querySelectorAll('[data-testid="file-size-limits"] button')].filter((button) => button.textContent.trim() === "Reset").length === 1);
    await resets.first().click();
    await page.waitForFunction(() => ![...document.querySelectorAll('[data-testid="file-size-limits"] button')].some((button) => button.textContent.trim() === "Reset"));
    await card.getByText("Built-in: 25 MB").first().waitFor();
    const saved = await api(admin, "GET", "/admin/storage/file-size-limits");
    if (saved.custom.length) throw new Error(JSON.stringify(saved.custom));
  });
} finally {
  await call(admin, "PUT", "/admin/storage/file-size-limits", { limitsMb: { PDF: null, OTHER: null } });
  await browser.close();
}
finish();
