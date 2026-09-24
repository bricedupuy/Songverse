// Passkeys: adding one from the account settings and signing in with it,
// using Chromium's virtual authenticator in place of a fingerprint reader.
// The relying-party ID is the parent domain the web app and API share
// (apps/api/src/auth/auth-domains.ts; localhost here).
import { chromium } from "playwright";
import { WEB, finish, signIn, stepper, user } from "../lib/harness.mjs";

let page;
const step = stepper(() => page);
const me = await user("Passkey holder");

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
page = await context.newPage();
const cdp = await context.newCDPSession(page);
await cdp.send("WebAuthn.enable");
const { authenticatorId } = await cdp.send("WebAuthn.addVirtualAuthenticator", {
  options: { protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true },
});

await step("add a passkey from the account settings", async () => {
  await signIn(page, me);
  await page.goto(`${WEB}/dashboard#settings`);
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Name (optional)").fill("My laptop");
  await page.getByRole("button", { name: "Add a passkey" }).click();
  await page.getByText("My laptop").waitFor();
  const { credentials } = await cdp.send("WebAuthn.getCredentials", { authenticatorId });
  if (credentials.length !== 1 || credentials[0].rpId !== new URL(WEB).hostname) throw new Error(JSON.stringify(credentials.map((c) => c.rpId)));
});

await step("sign out, then sign in with the passkey alone", async () => {
  await page.getByRole("button", { name: "Passkey holder" }).click();
  await page.getByRole("menuitem", { name: "Sign out" }).click();
  await page.waitForURL(`${WEB}/`);
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Sign in with a passkey" }).click();
  await page.waitForURL("**/library");
  await page.getByRole("button", { name: "Passkey holder" }).waitFor();
});

await browser.close();
finish();
