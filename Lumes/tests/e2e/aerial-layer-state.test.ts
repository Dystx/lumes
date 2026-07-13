import { chromium, type Page, type Route } from "playwright";

const baseUrl = process.env.LUMES_URL ?? "http://localhost:3000";

const healthyAircraftResponse = {
  type: "FeatureCollection",
  fetchedAt: "2026-07-12T12:00:00.000Z",
  bbox: [-9.5, 36.95, -6, 42.15],
  features: [
    {
      type: "Feature",
      geometry: { type: "Point", coordinates: [-8.2, 39.4, 1200] },
      properties: {
        callsign: "LUMES01",
        registration: "CS-LUM",
        aircraftType: "C172",
        headingDeg: 90,
        altitudeBarometricFt: 1200,
      },
    },
  ],
  meta: {
    airplanes_live: 1,
    adsb_fi: 1,
    opensky: 1,
    merged: 1,
    sources_live: 3,
    sub_queries: 2,
  },
  errors: [],
  source: "adsb-merge",
  dataState: { state: "healthy", updatedAt: "2026-07-12T12:00:00.000Z", reason: null },
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
  let aerialRequestCount = 0;

  await page.route("**/api/aerial*", async (route: Route) => {
    aerialRequestCount += 1;
    if (aerialRequestCount === 1) {
      await route.fulfill({
        status: 502,
        contentType: "application/json",
        body: JSON.stringify({
          error: "Aerial data is temporarily unavailable.",
          dataState: { state: "retryable-error", updatedAt: "2026-07-12T12:00:00.000Z", reason: "Aerial source unavailable" },
        }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(healthyAircraftResponse),
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

    const aerialToggle = panel.getByRole("button", { name: /Resposta aérea|Aerial response/ });
    await aerialToggle.waitFor({ state: "visible", timeout: 5_000 });
    await aerialToggle.click();

    const warning = page.getByTestId("aerial-source-warning");
    await warning.waitFor({ state: "visible", timeout: 10_000 });
    if (!(await warning.textContent())?.match(/Indisponível|unavailable/i)) {
      throw new Error(`aerial failure state was not localized in the Advanced panel: ${await warning.textContent()}`);
    }
    if (!(await aerialToggle.textContent())?.match(/Indisponível|unavailable/i)) {
      throw new Error("aerial toggle did not expose its retryable status");
    }

    await aerialToggle.click();
    await warning.waitFor({ state: "hidden", timeout: 5_000 });
    await aerialToggle.click();

    await page.waitForFunction(() => document.querySelectorAll('[data-testid="aerial-source-warning"]').length === 0, undefined, { timeout: 10_000 });
    if (aerialRequestCount !== 2) {
      throw new Error(`expected one failed request and one recovery request, got ${aerialRequestCount}`);
    }
    if (!(await aerialToggle.textContent())?.match(/1 aeronave|1 aircraft/)) {
      throw new Error("aerial recovery count was not shown in the Advanced panel");
    }

    console.log("✓ aerial optional-layer failure, localized warning, toggle recovery, and healthy count are browser-verified");
  } finally {
    await page.unroute("**/api/aerial*");
    await context.close();
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
