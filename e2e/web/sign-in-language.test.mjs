// Signed-out pages speak the browser's language (Accept-Language), and chart
// section headings follow the reader's language.
import { chromium } from "playwright";
import { WEB, api, finish, signIn, stamp, stepper, user } from "../lib/harness.mjs";

let page;
const step = stepper(() => page);
const reader = await user("Chart reader");
const song = await api(reader, "POST", "/song-versions", {
  title: `Language chart ${stamp}`,
  language: "en",
  artists: ["Someone"],
  content: "{start_of_verse}\n[G]Amazing grace\n{end_of_verse}\n{start_of_chorus}\n[C]My chains are gone\n{end_of_chorus}",
});

const browser = await chromium.launch();

await step("a French browser gets the sign-in card in French", async () => {
  const context = await browser.newContext({ locale: "fr-FR" });
  page = await context.newPage();
  await page.goto(WEB);
  await page.waitForLoadState("networkidle");
  await page.getByText("Bienvenue").waitFor();
  await page.getByRole("tab", { name: "S'inscrire" }).waitFor();
  await page.getByRole("button", { name: "Se connecter avec une clé d'accès" }).waitFor();
});

await step("a wrong password is explained in French", async () => {
  await page.fill("#signin-email", reader.email);
  await page.fill("#signin-password", "not-the-password");
  await page.getByRole("button", { name: "Se connecter", exact: true }).click();
  await page.getByText("E-mail ou mot de passe incorrect").waitFor();
});

await step("forgot password and reset pages are in French too", async () => {
  await page.getByRole("button", { name: "Mot de passe oublié ?" }).click();
  await page.getByText("Réinitialiser votre mot de passe", { exact: true }).waitFor();
  await page.goto(`${WEB}/reset-password`);
  await page.getByText("Lien invalide").waitFor();
  await page.context().close();
});

await step("an English browser gets English", async () => {
  const context = await browser.newContext({ locale: "en-US" });
  page = await context.newPage();
  await page.goto(WEB);
  await page.getByText("Welcome").waitFor();
});

await step("chart section headings follow the reader's language", async () => {
  await signIn(page, reader);
  await page.goto(`${WEB}/library/${song.id}?tab=editor`);
  await page.waitForLoadState("networkidle");
  await page.getByText("Chorus", { exact: true }).first().waitFor();
  await api(reader, "PATCH", "/users/me", { locale: "fr" });
  await page.reload();
  await page.waitForLoadState("networkidle");
  await page.getByText("Refrain", { exact: true }).first().waitFor();
  await page.getByText("Couplet", { exact: true }).first().waitFor();
});

await browser.close();
finish();
