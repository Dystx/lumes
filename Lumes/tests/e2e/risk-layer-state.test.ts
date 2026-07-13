import { chromium, type Page, type Route } from "playwright";

const baseUrl = process.env.LUMES_URL ?? "http://localhost:3000";

const healthyRiskResponse = {
  lat: 39.4,
  lon: -8.2,
  fetchedAt: "2026-07-12T12:00:00.000Z",
  risk: {
    score: 72.4,
    category: "very_high",
    ignitionLikelihood: 0.82,
    intensityPotential: 0.67,
  },
  dataState: { state: "healthy", updatedAt: "2026-07-12T12:00:00.000Z", source: "open-meteo" },
};

function findVisible(page: Page, selector: string) {
  return page.locator(selector).filter({ visible: true }).first();
}

async function main(): Promise<void> {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  let riskRequestCount = 0;

  await page.route("**/api/risk*", async (route: Route) => {
    riskRequestCount += 1;
    if (riskRequestCount === 1) {
      await route.fulfill({
        status: 502,
        contentType: "application/json",
        body: JSON.stringify({
          error: "Risk data is temporarily unavailable.",
          dataState: { state: "retryable-error", updatedAt: "2026-07-12T12:00:00.000Z", reason: "Weather source unavailable" },
        }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(healthyRiskResponse),
    });
  });

  try {
    await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.waitForTimeout(2_000);

    const explore = findVisible(page, 'button[aria-label="Explorar"], button[aria-label="Explore"]');
    await explore.waitFor({ state: "visible", timeout: 10_000 });
    await explore.click();
    const panel = page.getByRole("dialog", { name: /Explorar|Explore/ });
    await panel.waitFor({ state: "visible", timeout: 5_000 });
    await panel.getByRole("button", { name: /Avançado|Advanced/ }).click();

    const riskToggle = panel.getByRole("button", { name: /Risco composto|Composite risk/ });
    await riskToggle.waitFor({ state: "visible", timeout: 5_000 });
    await riskToggle.click();

    const status = page.getByTestId("risk-layer-status");
    await status.waitFor({ state: "visible", timeout: 10_000 });
    if (!(await status.textContent())?.match(/indisponível|unavailable/i)) {
      throw new Error(`risk failure state was not localized: ${await status.textContent()}`);
    }

    await riskToggle.click();
    await status.waitFor({ state: "hidden", timeout: 5_000 });
    await riskToggle.click();

    await page.waitForFunction(() => document.querySelector('[data-testid="risk-layer-status"]')?.textContent?.includes("72"), undefined, { timeout: 10_000 });
    if (riskRequestCount !== 2) {
      throw new Error(`expected one failed request and one recovery request, got ${riskRequestCount}`);
    }

    console.log("✓ composite-risk optional-layer failure, localized status, toggle recovery, and healthy score are browser-verified");
  } finally {
    await page.unroute("**/api/risk*");
    await context.close();
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
