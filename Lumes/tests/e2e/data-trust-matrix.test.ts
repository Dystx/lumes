import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright";

const baseUrl = process.env.LUMES_URL ?? "http://localhost:3000";
const evidenceDir = process.env.LUMES_EVIDENCE_DIR ?? "/tmp/lumes-data-trust-matrix";

type MatrixState = "healthy" | "fallback" | "stale" | "empty" | "error";
type Theme = "dark" | "light";
type Language = "pt" | "en";

const states: Array<{ name: MatrixState; expectedDomState: string }> = [
  { name: "healthy", expectedDomState: "fresh" },
  { name: "fallback", expectedDomState: "fallback" },
  { name: "stale", expectedDomState: "stale" },
  { name: "empty", expectedDomState: "empty" },
  { name: "error", expectedDomState: "error" },
];

const themes: Theme[] = ["dark", "light"];
const languages: Language[] = ["pt", "en"];
const viewports = [
  { width: 1280, height: 800 },
  { width: 1440, height: 900 },
];

function stateMeta(state: MatrixState): Record<string, string> {
  return {
    state,
    updatedAt: new Date().toISOString(),
    reason: state === "healthy" ? "" : `matrix-${state}`,
    source: "matrix",
  };
}

async function waitForTrustState(page: import("playwright").Page, expected: string): Promise<void> {
  const indicator = page.locator('[data-testid="data-trust-indicator"]:visible').first();
  await indicator.waitFor({ state: "visible", timeout: 15_000 });
  await page.waitForFunction(
    (state) => Array.from(document.querySelectorAll<HTMLElement>('[data-testid="data-trust-indicator"]')).some((candidate) => {
      const style = window.getComputedStyle(candidate);
      return style.display !== "none" && style.visibility !== "hidden" && candidate.dataset.trustState === state;
    }),
    expected,
    { timeout: 15_000 },
  );
}

async function main(): Promise<void> {
  mkdirSync(evidenceDir, { recursive: true });
  const browser = await chromium.launch({ headless: true });

  for (const viewport of viewports) {
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();
    let currentState: MatrixState = "healthy";

    await page.route("**/api/incidents", async (route) => {
      if (currentState === "error") {
        await route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ error: "Incident feed unavailable" }),
        });
        return;
      }

      const response = await route.fetch();
      const payload = await response.json() as Record<string, unknown>;
      payload.dataState = stateMeta(currentState);
      if (currentState === "empty") {
        payload.incidents = [];
        payload.count = 0;
        payload.totalRaw = 0;
        delete payload.distribution;
      }
      await route.fulfill({ response, json: payload });
    });
    await page.route("**/api/source-health", async (route) => {
      const now = new Date().toISOString();
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          sources: [
            "anepc-prociv-arcgis",
            "anepc-regional-commands",
            "ipma-fire-risk",
            "ipma-weather",
            "ipma-warnings",
          ].map((sourceId) => ({
            sourceId,
            sourceName: sourceId,
            status: "ok",
            tier: "core",
            state: "healthy",
            dataState: "healthy",
            lastSuccess: now,
            lastError: null,
            recordCount: 1,
            latencyMs: 1,
            sourceUpdatedAt: now,
            receivedAt: now,
          })),
          dataState: { state: "healthy", updatedAt: now, source: "matrix" },
        }),
      });
    });

    await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 30_000 });
    for (const state of states) {
      for (const theme of themes) {
        for (const language of languages) {
          currentState = state.name;
          await page.evaluate(({ theme: nextTheme, language: nextLanguage }) => {
            localStorage.setItem("theme", nextTheme);
            localStorage.setItem("ember-language", nextLanguage);
          }, { theme, language });
          await page.reload({ waitUntil: "domcontentloaded", timeout: 30_000 });
          await page.waitForFunction((nextTheme) => document.documentElement.classList.contains(nextTheme), theme, { timeout: 10_000 });
          await page.waitForFunction((nextLanguage) => document.documentElement.lang === (nextLanguage === "pt" ? "pt" : "en"), language, { timeout: 10_000 });
          await waitForTrustState(page, state.expectedDomState);
          await page.locator('[data-testid="ember-map"][data-map-ready="true"]').waitFor({ state: "visible", timeout: 15_000 });

          const hasHorizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
          if (hasHorizontalOverflow) throw new Error(`${viewport.width}x${viewport.height} ${state.name}/${theme}/${language} overflowed horizontally`);

          const filename = `${viewport.width}x${viewport.height}-${state.name}-${theme}-${language}.png`;
          await page.screenshot({ path: join(evidenceDir, filename), fullPage: false });
          console.log(`  ✓ ${filename}`);

          if (state.name === "healthy") {
            const exploreButton = page.getByRole("button", { name: /Explorar|Explore/ }).first();
            await exploreButton.click();
            const drawer = page.getByTestId("right-sidebar-drawer");
            await drawer.waitFor({ state: "visible" });
            await page.screenshot({
              path: join(evidenceDir, `${viewport.width}x${viewport.height}-${state.name}-${theme}-${language}-explore.png`),
              fullPage: false,
            });
            await page.keyboard.press("Escape");
            await drawer.waitFor({ state: "hidden" });

            await page.getByRole("button", { name: /Reset view to Portugal/ }).click();
            await page.locator("[data-sonner-toast]:visible").last().waitFor({ state: "visible" });
            await page.screenshot({
              path: join(evidenceDir, `${viewport.width}x${viewport.height}-${state.name}-${theme}-${language}-reset.png`),
              fullPage: false,
            });
          }

          if (state.name === "error") {
            const incident = page.getByTestId("situation-incident").first();
            await incident.waitFor({ state: "visible" });
            await incident.click();
            const inspector = page.getByRole("dialog", { name: /Inspector/ });
            await inspector.waitFor({ state: "visible" });
            await page.screenshot({
              path: join(evidenceDir, `${viewport.width}x${viewport.height}-${state.name}-${theme}-${language}-inspector.png`),
              fullPage: false,
            });
            await inspector.getByRole("button", { name: /Fechar painel|Close panel/ }).first().click();
            await inspector.waitFor({ state: "hidden" });
          }
        }
      }
    }
    await context.close();
  }

  await browser.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
