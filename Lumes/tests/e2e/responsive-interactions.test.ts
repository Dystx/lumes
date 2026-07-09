import { chromium } from "playwright";

const baseUrl = process.env.LUMES_URL ?? "http://localhost:3000";
const viewports = [
  { name: "small-mobile", width: 320, height: 568 },
  { name: "mobile", width: 390, height: 844 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "landscape-tablet", width: 1024, height: 768 },
  { name: "desktop", width: 1280, height: 800 },
  { name: "wide-desktop", width: 1440, height: 900 },
];

async function main(): Promise<void> {
  const browser = await chromium.launch({ headless: true });
  let failures = 0;

  for (const viewport of viewports) {
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();
    try {
      await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 30_000 });
      await page.waitForTimeout(1_000);
      const horizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
      if (horizontalOverflow) throw new Error("horizontal overflow");

      if (viewport.width < 1280) {
        const explore = page.getByRole("button", { name: /Explorar mapa|Explore map/ });
        await explore.click();
        const dialog = page.getByRole("dialog", { name: /Explorar mapa|Explore map/ });
        await dialog.waitFor({ state: "visible" });
        await page.keyboard.press("Escape");
        await dialog.waitFor({ state: "hidden" });

        if (viewport.width === 390) {
          await page.getByRole("button", { name: /Mais|More/ }).click();
          await page.getByRole("button", { name: /Comunicar Incêndio|Report Fire/ }).click();
          const report = page.getByRole("dialog", { name: /Comunicar Incêndio|Report Fire/ });
          await report.waitFor({ state: "visible" });
          await page.keyboard.press("Escape");
          await report.waitFor({ state: "hidden" });

          await page.getByRole("button", { name: /Alertas|Alerts/ }).click();
          await page.getByRole("button", { name: /Notificações|Notifications/ }).click();
          const notifications = page.getByRole("dialog", { name: /Ver notificações|View notifications/ });
          await notifications.waitFor({ state: "visible" });
          await page.keyboard.press("Escape");
          await notifications.waitFor({ state: "hidden" });
        }
      } else {
        await page.getByRole("button", { name: /Explorar|Explore/ }).click();
        // Explore is a non-modal accessible drawer; its semantic role is a
        // dialog so focus/escape behavior can be tested consistently.
        await page.getByRole("dialog", { name: /Explorar|Explore/ }).waitFor({ state: "visible" });
      }
      console.log(`  ✓ ${viewport.name}`);
    } catch (error) {
      failures += 1;
      console.error(`  ✗ ${viewport.name}: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      await context.close();
    }
  }

  await browser.close();
  if (failures > 0) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
