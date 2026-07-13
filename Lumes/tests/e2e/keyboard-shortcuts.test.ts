import { chromium } from "playwright";

const baseUrl = process.env.LUMES_URL ?? "http://localhost:3000";

async function main(): Promise<void> {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();

  try {
    await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.waitForTimeout(1_000);

    const opener = page.getByRole("button", { name: "Keyboard shortcuts" });
    await opener.focus();
    await page.keyboard.press("?");

    const dialog = page.getByRole("dialog", { name: /Keyboard shortcuts|Atalhos de teclado/ });
    await dialog.waitFor({ state: "visible", timeout: 5_000 });
    if (!(await dialog.evaluate((element) => element.contains(document.activeElement)))) {
      throw new Error("keyboard shortcuts dialog did not receive focus");
    }

    await page.keyboard.press("Escape");
    await dialog.waitFor({ state: "hidden", timeout: 5_000 });
    if (!(await opener.evaluate((element) => document.activeElement === element))) {
      throw new Error("keyboard shortcuts opener did not regain focus");
    }

    await page.getByRole("button", { name: /^Explorar$|^Explore$/ }).click();
    const search = page.locator('input[placeholder="Nome, município…"], input[placeholder="Name, municipality…"]').first();
    await search.waitFor({ state: "visible", timeout: 5_000 });
    await page.keyboard.press("/");
    await page.waitForFunction(() => {
      const active = document.activeElement;
      return active instanceof HTMLInputElement && active.placeholder.includes("municipality");
    }, undefined, { timeout: 5_000 });

    console.log("✓ keyboard shortcut dialog focus/restore and slash search focus are browser-verified");
  } finally {
    await context.close();
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
