import { chromium, type Page, type Route } from "playwright";

const baseUrl = process.env.LUMES_URL ?? "http://localhost:3000";

const healthyBiomassResponse = {
  type: "FeatureCollection",
  bbox: [-9.5, 36.95, -6, 42.15],
  cellCount: 1,
  features: [{
    type: "Feature",
    geometry: { type: "Point", coordinates: [-8.2, 39.4] },
    properties: {
      tonsPerHectare: 12,
      species: "maritime_pine",
      speciesLabel: "Pinheiro bravo",
      rateOfSpread: "high",
      fuelModel: "timber",
    },
  }],
  source: "synthetic (test fixture)",
  dataState: { state: "healthy", updatedAt: "2026-07-12T12:00:00.000Z", source: "synthetic-biomass" },
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
  let biomassRequestCount = 0;

  await page.route("**/api/biomass/grid*", async (route: Route) => {
    biomassRequestCount += 1;
    if (biomassRequestCount === 1) {
      await route.fulfill({
        status: 502,
        contentType: "application/json",
        body: JSON.stringify({
          error: "Biomass grid data is temporarily unavailable.",
          dataState: { state: "retryable-error", updatedAt: "2026-07-12T12:00:00.000Z", reason: "Biomass grid source unavailable" },
        }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(healthyBiomassResponse),
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

    const biomassToggle = panel.getByRole("button", { name: /Biomassa|Biomass/ });
    await biomassToggle.waitFor({ state: "visible", timeout: 5_000 });
    await biomassToggle.click();

    const status = page.getByTestId("biomass-layer-status");
    await status.waitFor({ state: "visible", timeout: 10_000 });
    if (!(await status.textContent())?.match(/indisponível|unavailable/i)) {
      throw new Error(`biomass failure state was not localized: ${await status.textContent()}`);
    }

    await biomassToggle.click();
    await status.waitFor({ state: "hidden", timeout: 5_000 });
    await biomassToggle.click();

    await page.waitForFunction(() => document.querySelector('[data-testid="biomass-layer-status"]')?.textContent?.includes("1"), undefined, { timeout: 10_000 });
    if (biomassRequestCount !== 2) {
      throw new Error(`expected one failed request and one recovery request, got ${biomassRequestCount}`);
    }

    console.log("✓ biomass optional-layer failure, localized status, toggle recovery, and healthy cell count are browser-verified");
  } finally {
    await page.unroute("**/api/biomass/grid*");
    await context.close();
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
