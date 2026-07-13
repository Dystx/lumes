import { chromium } from "playwright";

const baseUrl = process.env.LUMES_URL ?? "http://localhost:3000";

async function waitForStableMap(page: import("playwright").Page): Promise<void> {
  await page.locator('[data-testid="ember-map"][data-map-ready="true"]').waitFor({
    state: "visible",
    timeout: 15_000,
  });
  await page.waitForFunction(() => {
    const state = document.querySelector<HTMLElement>('[data-testid="ember-map"]')?.dataset.mapStyleState;
    return state === "ready" || state === "recovered";
  }, undefined, { timeout: 15_000 });
}

async function main(): Promise<void> {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    reducedMotion: "reduce",
  });
  const page = await context.newPage();

  try {
    await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await waitForStableMap(page);

    const map = page.getByTestId("ember-map");
    const themeToggle = page.getByRole("button", { name: "Toggle theme" }).first();

    await themeToggle.click();
    await page.waitForFunction(() => document.documentElement.classList.contains("light"), undefined, { timeout: 5_000 });
    await waitForStableMap(page);

    // Reverse immediately after the light transition. The map must settle on
    // the latest requested style and never publish a stale retryable state.
    await themeToggle.click();
    await page.waitForFunction(() => document.documentElement.classList.contains("dark"), undefined, { timeout: 5_000 });
    await waitForStableMap(page);

    const finalState = await map.getAttribute("data-map-style-state");
    if (finalState === "retryable-error") throw new Error("rapid theme reversal left the map retryable");
    if (await map.getAttribute("data-map-ready") !== "true") throw new Error("rapid theme reversal left the map unready");

    console.log("✓ MapLibre style transitions settle on the latest theme after a rapid reversal");
  } finally {
    await context.close();
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
