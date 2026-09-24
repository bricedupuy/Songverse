// Repro/regression: fast page switching must never yield "Missing bearer token".
import { chromium } from "playwright";
import { API, SP, stepper, user, signIn, finish } from "../lib/harness.mjs";

let page;
const step = stepper(() => page);
async function headerBadges(expected) {
  let got;
  for (let i = 0; i < 40; i++) {
    got = (await page.getByRole("list", { name: "Roles" }).first().locator("li").allInnerTexts().catch(() => [])).join("|");
    if (got === expected) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`header badges: ${got}`);
}

// EMAIL=<existing verified account> skips sign-up (sign-up is itself rate
// limited when the limiter is forced on for a repro).
const who = process.env.EMAIL ? { email: process.env.EMAIL } : await user("Fast Clicker");
if (process.env.ONLY_CREATE) {
  console.log(who.email);
  process.exit(0);
}
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
page = await context.newPage();
let tokenCalls = 0;
const byFn = new Map();
const failures = [];
page.on("response", async (res) => {
  if (res.url().includes("/_serverFn/")) {
    tokenCalls++;
    const id = res.url().split("/_serverFn/")[1].split("?")[0];
    byFn.set(id, (byFn.get(id) ?? 0) + 1);
  }
  if (res.url().startsWith(API) && res.status() === 401) failures.push(`${res.status()} ${res.url()} ${await res.text().catch(() => "")}`);
});
await signIn(page, who);
tokenCalls = 0;
byFn.clear();
const pages = ["Library", "Sets", "Library", "Sets"];
const started = Date.now();
const ROUNDS = Number(process.env.ROUNDS ?? 12);
let crashed = null;
try {
for (let i = 0; i < ROUNDS; i++) {
  for (const name of pages) {
    await page.locator('[data-slot="sidebar"]').getByRole("link", { name, exact: true }).click();
    await page.waitForTimeout(120);
  }
  await page.locator("[data-slot=sidebar-footer] button").first().click();
  await page.getByRole("menuitem", { name: "Dashboard" }).click();
  await page.waitForTimeout(120);
}
} catch (err) {
  crashed = err.message.split("\n")[0];
  await page.screenshot({ path: `${SP}/fast-nav-crash.png` });
  console.log("page text:", (await page.locator("body").innerText()).slice(0, 300));
}
await page.waitForLoadState("networkidle").catch(() => {});
const errorText = await page.getByText("Missing bearer token").count();
console.log(`${ROUNDS * 5} navigations in ${Date.now() - started}ms, ${tokenCalls} server-fn calls, ${failures.length} 401s, error on screen: ${errorText > 0}`);
console.log([...byFn].map(([id, n]) => `${n} x ${Buffer.from(id, "base64url").toString().slice(0, 90)}`).join("\n"));
for (const f of failures.slice(0, 3)) console.log("  " + f.slice(0, 200));
await step("no 'Missing bearer token' while switching pages fast", async () => {
  if (failures.length || errorText || crashed) throw new Error(`${failures.length} 401s ${crashed ?? ""}`);
});
await browser.close();
finish();
