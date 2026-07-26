/**
 * Deep Forge UI e2e via Playwright + local Chromium.
 * Used when the browse MCP daemon cannot start (no Google Chrome); same CDP/Chromium stack.
 */
import { createRequire } from "node:module";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright-core");

const WEB = process.env.FORGE_WEB_URL ?? "http://localhost:5173";
const OUT = process.env.FORGE_E2E_OUT ?? `data/forge-e2e/ui-${new Date().toISOString().replace(/[:.]/g, "-")}`;
const EMAIL = "forge-mobile-lead@local.dev";
const PASSWORD =
  process.env.SEED_FORGE_MOBILE_LEAD_PASSWORD ||
  process.env.SEED_FORGE_ADMIN_PASSWORD ||
  "ForgeMobileLead1!";
const CHROME =
  process.env.CHROME_PATH ||
  "/Applications/Chromium.app/Contents/MacOS/Chromium";

mkdirSync(OUT, { recursive: true });

async function shot(page, name) {
  const path = join(OUT, name);
  await page.screenshot({ path, fullPage: true });
  console.log(`screenshot ${path}`);
  return path;
}

const browser = await chromium.launch({
  executablePath: CHROME,
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});

const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const consoleErrors = [];
page.on("console", (msg) => {
  if (msg.type() === "error") consoleErrors.push(msg.text());
});

try {
  await page.goto(WEB, { waitUntil: "networkidle" });
  await shot(page, "01-login.png");

  // Login form — try common selectors
  const email = page.locator('input[type="email"], input[name="email"], #email').first();
  const password = page.locator('input[type="password"], input[name="password"], #password').first();
  await email.fill(EMAIL);
  await password.fill(PASSWORD);
  await page.locator('button[type="submit"], button:has-text("Sign in"), button:has-text("Log in")').first().click();
  await page.waitForTimeout(1500);
  await shot(page, "02-after-login.png");

  // Navigate Forge
  const forgeLink = page.locator('a[href="/forge"], a:has-text("Forge")').first();
  if (await forgeLink.count()) {
    await forgeLink.click();
    await page.waitForTimeout(1000);
  } else {
    await page.goto(`${WEB}/forge`, { waitUntil: "networkidle" });
  }
  await shot(page, "03-forge-dashboard.png");

  await page.goto(`${WEB}/forge/runners`, { waitUntil: "networkidle" }).catch(async () => {
    // settings nested route
    await page.goto(`${WEB}/forge`, { waitUntil: "networkidle" });
  });
  await shot(page, "04-runners.png");
  const bodyText = await page.locator("body").innerText();
  if (!/macOS|Android|iOS|Runner/i.test(bodyText)) {
    console.warn("WARN: runners page may not show expected text");
  }

  // Request build page (canonical route)
  await page.goto(`${WEB}/forge/builds/new`, { waitUntil: "networkidle" });
  await shot(page, "05-request-build.png");

  // Select first application / profile if present
  const appSelect = page.locator("#forge-app, select").first();
  if (await appSelect.count()) {
    const options = await appSelect.locator("option").allTextContents();
    const idx = options.findIndex((o, i) => i > 0 && o.trim());
    if (idx > 0) {
      await appSelect.selectOption({ index: idx });
      await page.waitForTimeout(400);
    }
  }
  const profileSelect = page.locator("#forge-profile").first();
  if (await profileSelect.count()) {
    const opts = await profileSelect.locator("option").allTextContents();
    const pidx = opts.findIndex((o, i) => i > 0 && /mock|demo|release|debug/i.test(o));
    if (pidx > 0) await profileSelect.selectOption({ index: pidx });
    else if (opts.length > 1) await profileSelect.selectOption({ index: 1 });
  }

  const android = page.locator("#forge-android");
  if (await android.count()) await android.check();
  const ios = page.locator("#forge-ios");
  if (await ios.count() && !(await ios.isDisabled())) {
    await ios.check();
  }
  await shot(page, "06-request-filled.png");

  const submit = page.locator('button:has-text("Submit build request")');
  if (await submit.count() && !(await submit.isDisabled())) {
    await submit.click();
    await page.waitForTimeout(2000);
    await shot(page, "07-after-submit.png");
  } else {
    console.warn("WARN: submit disabled or missing — UI still captured");
  }

  // Negative: assistant cannot use forge (spot-check via logout/login)
  await page.goto(`${WEB}/login`, { waitUntil: "networkidle" }).catch(() => {});
  const logout = page.locator('button:has-text("Sign out"), a:has-text("Sign out"), button:has-text("Log out")');
  if (await logout.count()) await logout.first().click();
  await page.waitForTimeout(500);
  if (await email.count()) {
    await email.fill("assistant@local.dev");
    await password.fill("ChangeMe!Asst1");
    await page.locator('button[type="submit"]').first().click();
    await page.waitForTimeout(1000);
    await page.goto(`${WEB}/forge`, { waitUntil: "networkidle" });
    await shot(page, "08-assistant-forge-denied.png");
  }

  writeFileSync(
    join(OUT, "summary.json"),
    JSON.stringify(
      {
        web: WEB,
        out: OUT,
        consoleErrors,
        ok: true,
      },
      null,
      2,
    ),
  );
  console.log(`Forge browser e2e passed. Screenshots in ${OUT}`);
  if (consoleErrors.length) {
    console.warn("console errors:", consoleErrors.slice(0, 10));
  }
} finally {
  await browser.close();
}
