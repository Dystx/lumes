import { chromium } from "playwright";

const baseUrl = process.env.LUMES_URL ?? "http://localhost:3000";

async function main(): Promise<void> {
  const browser = await chromium.launch({ headless: true });
  let failures = 0;

  for (const viewport of [{ width: 320, height: 568 }, { width: 390, height: 844 }]) {
    for (const theme of ["dark", "light"] as const) {
      const context = await browser.newContext({ viewport });
      await context.addInitScript((nextTheme) => {
        window.localStorage.setItem("theme", nextTheme);
      }, theme);
      const page = await context.newPage();
      try {
      await page.goto(`${baseUrl}/newsletter`, { waitUntil: "domcontentloaded", timeout: 30_000 });
      const email = page.getByLabel("Email");
      const submit = page.getByRole("button", { name: "Subscrever" });
      await email.waitFor({ state: "visible" });
      await submit.waitFor({ state: "visible" });
      // Hydration owns the submit handler; allow it to attach before the
      // first validation click when this suite runs beside the axe matrix.
      await page.waitForTimeout(350);

      await submit.click();
      if (!(await page.locator("form [role=alert]").isVisible())) throw new Error("newsletter validation alert missing");

      await page.route("**/api/newsletter/subscribe", (route) => route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: "Newsletter delivery is temporarily unavailable." }),
      }));
      await email.fill("citizen@example.com");
      await submit.click();
      const unavailable = page.locator("form [role=alert]");
      await unavailable.waitFor({ state: "visible" });
      if (!(await unavailable.textContent())?.includes("temporarily unavailable")) {
        throw new Error("provider-unavailable message missing");
      }
      await page.unroute("**/api/newsletter/subscribe");

      await page.route("**/api/newsletter/subscribe", (route) => route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, status: "pending_confirmation" }),
      }));
      await submit.click();
      const pending = page.locator("form [role=status]");
      await pending.waitFor({ state: "visible" });
      const pendingDeadline = Date.now() + 5_000;
      while (Date.now() < pendingDeadline && !(await pending.textContent())?.includes("Verifique o seu email")) {
        await page.waitForTimeout(50);
      }
      if (!(await pending.textContent())?.includes("Verifique o seu email")) {
        throw new Error("pending-confirmation message missing");
      }
      await page.unroute("**/api/newsletter/subscribe");

      await page.goto(`${baseUrl}/status`, { waitUntil: "domcontentloaded", timeout: 30_000 });
      const lang = await page.locator("html").getAttribute("lang");
      if (lang !== "pt-PT") throw new Error(`public route lang is ${lang}`);
      if (!(await page.locator(`html.${theme}`).count())) throw new Error(`public ${theme} theme was not applied`);
      const statusBanner = page.locator('[data-status-state="ok"]:visible, [data-status-state="degraded"]:visible').first();
      await statusBanner.waitFor({ state: "visible" });
      const statusState = await statusBanner.getAttribute("data-status-state");
      if (statusState !== "ok" && statusState !== "degraded") throw new Error(`unexpected status state ${statusState}`);
      const sourceState = await page.locator("[data-status-sources-state]:visible").first().getAttribute("data-status-sources-state");
      if (sourceState !== "available" && sourceState !== "empty") throw new Error(`unexpected source state ${sourceState}`);

      const unsubscribe = await context.request.get(`${baseUrl}/api/newsletter/unsubscribe?token=invalid-token`);
      if (unsubscribe.status() !== 410) throw new Error(`invalid unsubscribe returned ${unsubscribe.status()}`);
      console.log(`  ✓ ${viewport.width}x${viewport.height} ${theme} (${statusState}/${sourceState})`);
      } catch (error) {
        failures += 1;
        console.error(`  ✗ ${viewport.width}x${viewport.height} ${theme}: ${error instanceof Error ? error.message : String(error)}`);
      } finally {
        await context.close();
      }
    }
  }

  await browser.close();
  if (failures > 0) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
