import { chromium, type Page, type Route } from "playwright";

const baseUrl = process.env.LUMES_URL ?? "http://localhost:3000";

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

async function pullToRefresh(page: Page): Promise<void> {
  const scrollOwner = page.locator('[data-testid="mobile-content-sheet"]:visible .ember-scroll').first();
  await scrollOwner.waitFor({ state: "visible", timeout: 10_000 });
  await scrollOwner.evaluate((element) => { (element as HTMLElement).scrollTop = 0; });
  const box = await scrollOwner.boundingBox();
  if (!box) throw new Error("mobile incident scroll owner bounds unavailable");

  const x = box.x + box.width / 2;
  // Keep the gesture below the sticky header/toast corridor. Pointer events
  // bubble from the dashboard content to PullToRefresh's scroll owner.
  const startY = box.y + Math.min(220, box.height / 2);
  await page.mouse.move(x, startY);
  await page.mouse.down();
  await page.mouse.move(x, startY + 240, { steps: 10 });
  await page.waitForTimeout(120);
  await page.mouse.up();
}

async function fulfillRetryable(route: Route): Promise<void> {
  await route.fulfill({
    status: 503,
    contentType: "application/json",
    body: JSON.stringify({
      error: "Live incident data is temporarily unavailable.",
      dataState: { state: "retryable-error", updatedAt: "2026-07-12T12:00:00.000Z", reason: "test fixture" },
    }),
  });
}

async function main(): Promise<void> {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });
  const page = await context.newPage();

  let refreshMode: "success" | "failure" = "success";
  let refreshActive = false;
  let incidentRefreshCount = 0;
  let dashboardRefreshCount = 0;
  let incidentSeen = deferred();
  let dashboardSeen = deferred();
  let incidentRelease = deferred();
  let dashboardRelease = deferred();

  await page.route("**/api/incidents", async (route) => {
    if (!refreshActive) {
      await route.continue();
      return;
    }
    incidentRefreshCount += 1;
    incidentSeen.resolve();
    await incidentRelease.promise;
    if (refreshMode === "failure") {
      await fulfillRetryable(route);
    } else {
      await route.continue();
    }
  });

  await page.route("**/api/dashboard", async (route) => {
    if (!refreshActive) {
      await route.continue();
      return;
    }
    dashboardRefreshCount += 1;
    dashboardSeen.resolve();
    await dashboardRelease.promise;
    if (refreshMode === "failure") {
      await fulfillRetryable(route);
    } else {
      await route.continue();
    }
  });

  let timelineRequestCount = 0;
  let timelineFirstRequest = deferred();
  let timelineRelease = deferred();
  await page.route("**/api/incidents/*/timeline", async (route) => {
    timelineRequestCount += 1;
    if (timelineRequestCount === 1) {
      timelineFirstRequest.resolve();
      await timelineRelease.promise;
      await fulfillRetryable(route);
      return;
    }
    const timelineUrl = new URL(route.request().url());
    const timelineParts = timelineUrl.pathname.split("/").filter(Boolean);
    const incidentId = decodeURIComponent(timelineParts.at(-2) ?? "fixture");
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ incidentId, count: 0, snapshots: [] }),
    });
  });

  try {
    await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.waitForTimeout(2_500);

    const navigation = page.getByRole("navigation", { name: /Navegação principal|Primary navigation/ });
    await navigation.getByRole("button", { name: /Incidentes|Incidents/ }).click();
    const mobileSheet = page.getByTestId("mobile-content-sheet");
    await mobileSheet.waitFor({ state: "visible", timeout: 10_000 });

    refreshActive = true;
    refreshMode = "success";
    await pullToRefresh(page);
    await page.getByText("Atualizando…", { exact: true }).waitFor({ state: "visible", timeout: 5_000 });
    await Promise.all([incidentSeen.promise, dashboardSeen.promise]);
    if (incidentRefreshCount !== 1 || dashboardRefreshCount !== 1) {
      throw new Error(`expected one incident/dashboard refresh request, got ${incidentRefreshCount}/${dashboardRefreshCount}`);
    }
    if (!(await page.getByText("Atualizando…", { exact: true }).isVisible())) {
      throw new Error("refresh indicator cleared before both requests settled");
    }
    incidentRelease.resolve();
    dashboardRelease.resolve();
    await page.getByText("Atualizando…", { exact: true }).waitFor({ state: "hidden", timeout: 10_000 });

    incidentRefreshCount = 0;
    dashboardRefreshCount = 0;
    incidentSeen = deferred();
    dashboardSeen = deferred();
    incidentRelease = deferred();
    dashboardRelease = deferred();
    refreshMode = "failure";
    await pullToRefresh(page);
    await page.getByText("Atualizando…", { exact: true }).waitFor({ state: "visible", timeout: 5_000 });
    await Promise.all([incidentSeen.promise, dashboardSeen.promise]);
    incidentRelease.resolve();
    dashboardRelease.resolve();
    await page.getByText("Atualizando…", { exact: true }).waitFor({ state: "hidden", timeout: 10_000 });
    const refreshWarning = page.getByTestId("mobile-data-trust-warning");
    await refreshWarning.waitFor({ state: "visible", timeout: 5_000 });
    if (!(await refreshWarning.textContent())?.match(/A atualização falhou|Refresh failed/)) {
      throw new Error("mobile refresh failure was not explained in the active incident sheet");
    }

    // A retry must keep its pending state while the new incident and
    // dashboard requests are unresolved. The existing trust warning may remain
    // until the successful response replaces the failed generation.
    incidentRefreshCount = 0;
    dashboardRefreshCount = 0;
    incidentSeen = deferred();
    dashboardSeen = deferred();
    incidentRelease = deferred();
    dashboardRelease = deferred();
    refreshMode = "success";
    await pullToRefresh(page);
    await page.getByText("Atualizando…", { exact: true }).waitFor({ state: "visible", timeout: 5_000 });
    await Promise.all([incidentSeen.promise, dashboardSeen.promise]);
    incidentRelease.resolve();
    dashboardRelease.resolve();
    await page.getByText("Atualizando…", { exact: true }).waitFor({ state: "hidden", timeout: 10_000 });
    await refreshWarning.waitFor({ state: "hidden", timeout: 5_000 });

    refreshActive = false;
    const incidentButton = mobileSheet
      .locator("button")
      .filter({ hasText: /high|medium|low|critical/i })
      .filter({ hasText: /·/ })
      .first();
    await incidentButton.waitFor({ state: "visible", timeout: 10_000 });
    await incidentButton.click();
    const detail = page.getByTestId("incident-detail-panel");
    await detail.waitFor({ state: "visible", timeout: 10_000 });

    await timelineFirstRequest.promise;
    const timeline = detail.locator("details").filter({ hasText: /Cronologia|Timeline/ }).first();
    await timeline.locator("summary").click();
    await detail.getByText(/A carregar a linha temporal…|Loading timeline…/, { exact: true }).waitFor({ state: "visible", timeout: 5_000 });
    timelineRelease.resolve();

    const timelineAlert = detail.getByRole("alert");
    await timelineAlert.waitFor({ state: "visible", timeout: 10_000 });
    await timelineAlert.getByRole("button", { name: /Tentar novamente|Retry/ }).click();
    await timelineAlert.waitFor({ state: "hidden", timeout: 10_000 });
    if (timelineRequestCount !== 2) throw new Error(`expected one retry timeline request, got ${timelineRequestCount}`);
    if ((await timeline.getAttribute("open")) === null) {
      throw new Error("timeline disclosure closed during retry recovery");
    }

    console.log("✓ mobile refresh waits for both requests and exposes failure; timeline loading/retry/recovery is browser-verified");
  } finally {
    await page.unroute("**/api/incidents");
    await page.unroute("**/api/dashboard");
    await page.unroute("**/api/incidents/*/timeline");
    await context.close();
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
