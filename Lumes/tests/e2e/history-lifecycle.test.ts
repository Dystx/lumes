import { chromium, type Page } from "playwright";

const baseUrl = process.env.LUMES_URL ?? "http://localhost:3000";

const historyIncident = {
  id: "history-e2e-1",
  sourceId: "anepc",
  sourceInternalId: "history-e2e-1",
  displayName: "Historical test incident",
  eventType: "wildfire",
  status: "resolved",
  severity: "medium",
  latitude: 38.7,
  longitude: -9.1,
  estimatedAreaHa: 2,
  municipality: "Lisboa",
  parish: "Santa Maria Maior",
  district: "Lisboa",
  personnelTotal: 4,
  assetsGround: 1,
  assetsAerial: 0,
  confidence: 1,
  rasi: null,
  naturezaText: null,
  statusText: "Historical test record",
  firstSeen: "2026-07-12T10:00:00.000Z",
  lastSeen: "2026-07-12T10:30:00.000Z",
  firstDetected: "2026-07-12T10:00:00.000Z",
  lastUpdated: "2026-07-12T10:30:00.000Z",
  createdAt: "2026-07-12T10:00:00.000Z",
  updatedAt: "2026-07-12T10:30:00.000Z",
};

function historyPayload() {
  return {
    count: 1,
    total: 1,
    incidents: [historyIncident],
    fetchedAt: "2026-07-13T10:01:00.000Z",
    dataState: {
      state: "healthy",
      updatedAt: "2026-07-13T10:01:00.000Z",
      source: "history-e2e",
    },
  };
}

async function openHistory(page: Page) {
  const navigation = page.getByRole("navigation", { name: /Navegação principal|Primary navigation/ });
  await navigation.getByRole("button", { name: /Alertas|Alerts/ }).click();
  const mobileSheet = page.locator('[data-testid="mobile-content-sheet"]:visible');
  await mobileSheet.getByRole("button", { name: /Histórico|History/ }).click();
  const dialog = page.getByRole("dialog", { name: /Histórico de Incêndios|Incident History/ });
  await dialog.waitFor({ state: "visible", timeout: 10_000 });
  return dialog;
}

async function main(): Promise<void> {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
    serviceWorkers: "block",
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  let historyMode: "empty" | "error" | "success" = "empty";

  await page.route("**/api/history*", async (route) => {
    if (historyMode === "error") {
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({
          error: "Incident history is temporarily unavailable.",
          dataState: {
            state: "retryable-error",
            updatedAt: "2026-07-13T10:01:00.000Z",
            reason: "history-e2e failure",
          },
        }),
      });
      return;
    }
    if (historyMode === "empty") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          count: 0,
          total: 0,
          incidents: [],
          fetchedAt: "2026-07-13T10:01:00.000Z",
          dataState: {
            state: "empty",
            updatedAt: "2026-07-13T10:01:00.000Z",
            source: "history-e2e",
          },
        }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(historyPayload()),
    });
  });

  try {
    await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.waitForTimeout(1_500);

    let historyDialog = await openHistory(page);
    if (await historyDialog.getByTestId("data-trust-indicator").getAttribute("data-trust-state") !== "empty") {
      throw new Error("empty history did not expose an empty trust state");
    }
    await historyDialog.getByText(/Ainda não há histórico|No incident history yet/).waitFor({ state: "visible" });
    await historyDialog.getByRole("button", { name: /Fechar histórico|Close history/ }).click();
    await historyDialog.waitFor({ state: "hidden" });

    historyMode = "error";
    await page.reload({ waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.waitForTimeout(1_500);
    historyDialog = await openHistory(page);
    if (await historyDialog.getByTestId("data-trust-indicator").getAttribute("data-trust-state") !== "error") {
      throw new Error("history failure did not expose an error trust state");
    }
    await historyDialog.getByRole("alert").waitFor({ state: "visible", timeout: 10_000 });

    historyMode = "success";
    await historyDialog.getByRole("button", { name: /Tentar novamente|Retry/ }).click();
    await historyDialog.getByRole("button", { name: /Historical test incident/ }).waitFor({ state: "visible", timeout: 10_000 });
    if (await historyDialog.getByTestId("data-trust-indicator").getAttribute("data-trust-state") !== "fresh") {
      throw new Error("history retry did not restore a fresh trust state");
    }
    await historyDialog.getByRole("button", { name: /Historical test incident/ }).click();

    const detail = page.getByRole("dialog", { name: /Detalhes do incêndio|Incident details/ });
    await detail.waitFor({ state: "visible", timeout: 10_000 });
    await detail.getByText(/Risco IPMA não disponível para este registo histórico|IPMA risk is unavailable for this historical record/).waitFor({ state: "visible" });
    if (await detail.getByTestId("incident-follow-toggle").count() !== 0) {
      throw new Error("historical incident exposed a live-only follow control");
    }
    console.log("  ✓ history empty, retryable, and historical selection flows pass");
  } finally {
    await context.close();
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
