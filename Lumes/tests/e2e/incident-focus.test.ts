import { chromium } from "playwright";

const baseUrl = process.env.LUMES_URL ?? "http://localhost:3000";
const featureEnabled = process.env.LUMES_3D_E2E === "1";
const reducedMotion = process.env.LUMES_3D_REDUCED_MOTION === "1";
const fixtureMode = process.env.LUMES_3D_FIXTURE === "1";

interface IncidentListResponse {
  incidents?: Array<{ id?: string }>;
}

async function resolveIncidentId(): Promise<string> {
  if (fixtureMode) return "inc-monchique-2026";

  const explicitId = process.env.LUMES_3D_INCIDENT_ID;
  if (explicitId) return explicitId;

  const response = await fetch(`${baseUrl}/api/incidents`);
  if (response.ok) {
    const payload = await response.json() as IncidentListResponse;
    const firstId = payload.incidents?.find((incident) => typeof incident.id === "string")?.id;
    if (firstId) return firstId;
  }

  // The repository sample data keeps this stable for local fallback mode.
  return "inc-monchique-2026";
}

async function installIncidentFixture(page: import("playwright").Page): Promise<void> {
  if (!fixtureMode) return;

  await page.route("**/api/incidents", async (route) => {
    await route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: "fixture upstream unavailable" }),
    });
  });
}

async function waitForStableMap(page: import("playwright").Page): Promise<void> {
  await page.waitForFunction(() => {
    const map = document.querySelector<HTMLElement>('[data-testid="ember-map"]');
    const styleState = map?.getAttribute("data-map-style-state");
    return map?.getAttribute("data-map-ready") === "true"
      && (styleState === "ready" || styleState === "recovered")
      && map.getAttribute("data-incident-source-ready") === "true";
  }, undefined, { timeout: 15_000 });
}

async function main(): Promise<void> {
  const incidentId = await resolveIncidentId();
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    reducedMotion: reducedMotion ? "reduce" : "no-preference",
  });
  const page = await context.newPage();
  await installIncidentFixture(page);

  try {
    await page.goto(`${baseUrl}/?incident=${encodeURIComponent(incidentId)}`, {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });
    await page.waitForTimeout(2_000);

    const entry = page.locator('[data-testid="incident-focus-entry"]:visible');
    const status = page.locator('[data-testid="incident-focus-status"]:visible');

    if (!featureEnabled) {
      if (await page.getByTestId("incident-focus-entry").count() !== 0 || await page.getByTestId("incident-focus-status").count() !== 0) {
        throw new Error("3D Incident Focus rendered while its feature flag is off");
      }
      console.log("  ✓ feature flag off keeps the 2D map unchanged");
      return;
    }

    await entry.first().waitFor({ state: "visible", timeout: 10_000 });
    const openerLabel = await entry.first().getAttribute("aria-label");
    await entry.first().click();
    await status.waitFor({ state: "visible", timeout: 5_000 });
    await page.waitForTimeout(reducedMotion ? 50 : 800);

    const themeToggle = page.getByRole("button", { name: "Toggle theme" }).first();
    for (const expectedTheme of ["light", "dark"]) {
      // The Inspector intentionally owns pointer events over the map shell
      // while focus is active. Trigger the same theme action programmatically
      // so this gate isolates style restoration from unrelated hit-testing.
      await themeToggle.evaluate((button) => button.click());
      await page.waitForFunction((theme) => document.documentElement.classList.contains(theme), expectedTheme, { timeout: 5_000 });
      await page.waitForTimeout(reducedMotion ? 10 : 50);
      if (!(await status.isVisible())) {
        throw new Error("style transition hid the active Incident Focus status");
      }
      await waitForStableMap(page);
      await status.waitFor({ state: "visible", timeout: 5_000 });
    }

    const controls = page.getByTestId("map-controls");
    const attribution = page.getByTestId("map-attribution");
    const statusBox = await status.boundingBox();
    const controlsBox = await controls.boundingBox();
    const attributionBox = await attribution.boundingBox();
    if (!statusBox || !controlsBox || !attributionBox) throw new Error("focus chrome bounds unavailable");
    const overlaps = (a: NonNullable<typeof statusBox>, b: NonNullable<typeof statusBox>) =>
      a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;

    const runEdgeViewportFlow = async (width: number, height: number, label: string) => {
      const edgeContext = await browser.newContext({
        viewport: { width, height },
        reducedMotion: reducedMotion ? "reduce" : "no-preference",
      });
      const edgePage = await edgeContext.newPage();
      await installIncidentFixture(edgePage);
      try {
        await edgePage.goto(`${baseUrl}/?incident=${encodeURIComponent(incidentId)}`, {
          waitUntil: "domcontentloaded",
          timeout: 30_000,
        });
        await edgePage.waitForTimeout(2_000);
        await waitForStableMap(edgePage);
        const edgeEntry = edgePage.locator('[data-testid="incident-focus-entry"]:visible').first();
        await edgeEntry.waitFor({ state: "visible", timeout: 10_000 });
        await edgeEntry.click();
        const edgeStatus = edgePage.locator('[data-testid="incident-focus-status"]:visible').first();
        await edgeStatus.waitFor({ state: "visible", timeout: 5_000 });

        const edgeStatusBox = await edgeStatus.boundingBox();
        const edgeControlsBox = await edgePage.getByTestId("map-controls").boundingBox();
        const edgeAttributionBox = await edgePage.getByTestId("map-attribution").boundingBox();
        if (!edgeStatusBox) {
          throw new Error(`${label} focus chrome bounds unavailable`);
        }
        if ((edgeControlsBox && overlaps(edgeStatusBox, edgeControlsBox))
          || (edgeAttributionBox && overlaps(edgeStatusBox, edgeAttributionBox))) {
          throw new Error(`${label} focus status overlaps map controls or attribution`);
        }

        await edgePage.keyboard.press("Escape");
        await edgeStatus.waitFor({ state: "hidden", timeout: 5_000 });
      } finally {
        await edgeContext.close();
      }
    };

    const runNonMapTabFlow = async (width: number, tabPattern: RegExp, tablet: boolean) => {
      const compactContext = await browser.newContext({
        viewport: { width, height: tablet ? 900 : 844 },
        reducedMotion: reducedMotion ? "reduce" : "no-preference",
      });
      const compactPage = await compactContext.newPage();
      await installIncidentFixture(compactPage);
      try {
        await compactPage.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 30_000 });
        await compactPage.waitForTimeout(2_000);
        const tab = tablet
          ? compactPage.getByTestId("mobile-tablet-toolbar").getByRole("button", { name: tabPattern })
          : compactPage.locator('nav[aria-label="Navegação principal"], nav[aria-label="Primary navigation"]').getByRole("button", { name: tabPattern });
        await tab.click();
        const incidentRow = compactPage.getByTestId("dashboard-priority-incident").first();
        await incidentRow.waitFor({ state: "visible", timeout: 10_000 });
        await incidentRow.click();
        const compactEntry = compactPage.locator('[data-testid="incident-focus-entry"]:visible').first();
        await compactEntry.waitFor({ state: "visible", timeout: 10_000 });
        await compactEntry.click();
        const compactStatus = compactPage.locator('[data-testid="incident-focus-status"]:visible').first();
        await compactStatus.waitFor({ state: "visible", timeout: 5_000 });
        const mapSurface = compactPage.getByTestId("mobile-map-surface");
        if (await mapSurface.getAttribute("aria-hidden") === "true") {
          throw new Error("compact Incident Focus hid the map after entering from a non-map tab");
        }
        await compactPage.keyboard.press("Escape");
        await compactStatus.waitFor({ state: "hidden", timeout: 5_000 });
        await compactPage.waitForFunction(() => Array.from(document.querySelectorAll("button"))
          .some((button) => button.getAttribute("aria-current") === "page"
            && /Incêndios|Incidents/.test(button.getAttribute("aria-label") ?? button.textContent ?? "")),
        undefined,
        { timeout: 5_000 });
        if (await tab.getAttribute("aria-current") !== "page") {
          throw new Error("compact Incident Focus did not restore the previous mobile tab");
        }
      } finally {
        await compactContext.close();
      }
    };
    if (overlaps(statusBox, controlsBox) || overlaps(statusBox, attributionBox)) {
      throw new Error("focus status overlaps map controls or attribution");
    }

    await page.keyboard.press("Escape");
    await status.waitFor({ state: "hidden", timeout: 5_000 });
    const restoredEntry = page.locator('[data-testid="incident-focus-entry"]:visible').first();
    if (openerLabel && await restoredEntry.getAttribute("aria-label") !== openerLabel) {
      throw new Error("focus opener was not restored");
    }
    await page.waitForFunction(() => {
      const entry = Array.from(document.querySelectorAll<HTMLElement>('[data-testid="incident-focus-entry"]'))
        .find((candidate) => candidate.getClientRects().length > 0);
      return entry !== undefined && document.activeElement === entry;
    }, undefined, { timeout: 5_000 });
    const focusedOpener = await restoredEntry.evaluate((element) => document.activeElement === element);
    if (!focusedOpener) throw new Error("focus did not return to the Inspector CTA");

    await restoredEntry.click();
    await status.waitFor({ state: "visible", timeout: 5_000 });
    await page.getByRole("button", { name: /Return to Portugal overview|Voltar à vista de Portugal/ }).first().click();
    await status.waitFor({ state: "hidden", timeout: 5_000 });

    const tabletContext = await browser.newContext({
      viewport: { width: 768, height: 900 },
      reducedMotion: reducedMotion ? "reduce" : "no-preference",
    });
    const tabletPage = await tabletContext.newPage();
    await installIncidentFixture(tabletPage);
    try {
      await tabletPage.goto(`${baseUrl}/?incident=${encodeURIComponent(incidentId)}`, {
        waitUntil: "domcontentloaded",
        timeout: 30_000,
      });
      await tabletPage.waitForTimeout(2_000);
      const tabletEntry = tabletPage.locator('[data-testid="incident-focus-entry"]:visible').first();
      await tabletEntry.waitFor({ state: "visible", timeout: 10_000 });
      await tabletEntry.click();
      const tabletStatus = tabletPage.locator('[data-testid="incident-focus-status"]:visible').first();
      await tabletStatus.waitFor({ state: "visible", timeout: 5_000 });
      const tabletStatusBox = await tabletStatus.boundingBox();
      const tabletToolbarBox = await tabletPage.getByTestId("mobile-tablet-toolbar").boundingBox();
      if (!tabletStatusBox || !tabletToolbarBox) throw new Error("tablet focus chrome bounds unavailable");
      if (overlaps(tabletStatusBox, tabletToolbarBox)) {
        throw new Error("tablet focus status overlaps the tablet toolbar");
      }
      await tabletPage.keyboard.press("Escape");
      await tabletStatus.waitFor({ state: "hidden", timeout: 5_000 });
    } finally {
      await tabletContext.close();
    }

    const mobileContext = await browser.newContext({
      viewport: { width: 390, height: 844 },
      reducedMotion: reducedMotion ? "reduce" : "no-preference",
    });
    const mobilePage = await mobileContext.newPage();
    await installIncidentFixture(mobilePage);
    try {
      await mobilePage.goto(`${baseUrl}/?incident=${encodeURIComponent(incidentId)}`, {
        waitUntil: "domcontentloaded",
        timeout: 30_000,
      });
      await mobilePage.waitForTimeout(2_000);
      const mobileEntry = mobilePage.locator('[data-testid="incident-focus-entry"]:visible').first();
      await mobileEntry.waitFor({ state: "visible", timeout: 10_000 });
      await mobileEntry.click();
      await mobilePage.locator('[data-testid="incident-focus-status"]:visible').waitFor({ state: "visible", timeout: 5_000 });
    await mobilePage.waitForTimeout(800);
      const mobileStatus = mobilePage.locator('[data-testid="incident-focus-status"]:visible').first();
      const mobileLegend = mobilePage.getByTestId("mobile-legend-toggle");
      await mobileLegend.waitFor({ state: "visible", timeout: 5_000 });
      await mobileLegend.click();
      const mobileStatusBox = await mobileStatus.boundingBox();
      const mobileLegendBox = await mobileLegend.boundingBox();
      if (!mobileStatusBox || !mobileLegendBox) throw new Error("mobile focus chrome bounds unavailable");
      if (overlaps(mobileStatusBox, mobileLegendBox)) {
        throw new Error("mobile focus status overlaps the expanded legend");
      }
      const mobileExitCandidates = await mobilePage.getByRole("button", { name: /Exit 3D focus|Sair do foco 3D/ }).all();
      const mobileOverviewCandidates = await mobilePage.getByRole("button", { name: /Return to Portugal overview|Voltar à vista de Portugal/ }).all();
      const hasVisibleMobileExit = (await Promise.all(mobileExitCandidates.map((button) => button.isVisible()))).some(Boolean);
      const hasVisibleMobileOverview = (await Promise.all(mobileOverviewCandidates.map((button) => button.isVisible()))).some(Boolean);
      if (!hasVisibleMobileExit || !hasVisibleMobileOverview) {
        throw new Error("mobile focus actions do not expose visible labels");
      }
      const detailSheet = mobilePage.getByRole("dialog", { name: /Incident details|Detalhes do incêndio/ });
      if (await detailSheet.count() > 0 && await detailSheet.first().isVisible()) {
        throw new Error("mobile incident sheet remains over the active focus map");
      }
      await mobilePage.keyboard.press("Escape");
      await mobilePage.locator('[data-testid="incident-focus-status"]:visible').waitFor({ state: "hidden", timeout: 5_000 });
    } finally {
      await mobileContext.close();
    }

    await runNonMapTabFlow(390, /Incêndios|Incidents/, false);
    await runNonMapTabFlow(768, /Incêndios|Incidents/, true);
    await runEdgeViewportFlow(1280, 800, "wide edge");
    await runEdgeViewportFlow(320, 568, "small edge");

    console.log(`  ✓ enter, active status, Escape/focus restore, and national reset work${reducedMotion ? " with reduced motion" : ""}`);
  } finally {
    await context.close();
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
