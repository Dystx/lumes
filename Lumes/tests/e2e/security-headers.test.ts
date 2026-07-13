import { chromium } from "playwright";

const baseUrl = process.env.LUMES_URL ?? "http://localhost:3000";

async function main(): Promise<void> {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  try {
    const response = await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 30_000 });
    if (!response) throw new Error("home response unavailable");

    const headers = response.headers();
    const csp = headers["content-security-policy"] ?? "";
    const requiredOrigins = [
      "https://basemaps.cartocdn.com",
      "https://api.ipma.pt",
      "https://services-eu1.arcgis.com",
    ];
    for (const origin of requiredOrigins) {
      if (!csp.includes(origin)) throw new Error(`CSP is missing ${origin}`);
    }
    if (!csp.includes("frame-ancestors 'none'")) throw new Error("CSP frame policy is missing");
    if (headers["x-content-type-options"] !== "nosniff") throw new Error("nosniff header is missing");
    if (headers["referrer-policy"] !== "strict-origin-when-cross-origin") throw new Error("referrer policy is missing");

    // This proves the hardened CSP still permits MapLibre style/layer startup.
    await page.locator('[data-testid="ember-map"][data-map-ready="true"]').waitFor({ state: "visible", timeout: 15_000 });

    const health = await context.request.get(`${baseUrl}/api/health`);
    if (![200, 503].includes(health.status())) throw new Error(`health returned unexpected ${health.status()}`);
    if (health.headers()["cache-control"] !== "no-store") throw new Error("health response is cacheable");
    console.log("  ✓ security headers and MapLibre compatibility");
  } finally {
    await context.close();
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
