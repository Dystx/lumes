import { chromium } from "playwright";

const baseUrl = process.env.LUMES_URL ?? "http://localhost:3000";

interface IncidentListResponse {
  incidents?: Array<{ id?: unknown }>;
}

async function resolveIncidentId(): Promise<string> {
  const explicitId = process.env.LUMES_INCIDENT_ID;
  if (explicitId) return explicitId;

  try {
    const response = await fetch(`${baseUrl}/api/incidents`);
    if (response.ok) {
      const payload = await response.json() as IncidentListResponse;
      const firstId = payload.incidents?.find((incident) => typeof incident.id === "string")?.id;
      if (typeof firstId === "string") return firstId;
    }
  } catch {
    // The local fallback dataset keeps this stable for offline/dev runs.
  }

  return "inc-monchique-2026";
}

async function main(): Promise<void> {
  const incidentId = await resolveIncidentId();
  const browser = await chromium.launch({ headless: true });

  try {
    for (const viewport of [
      { name: "mobile", width: 390, height: 844, surface: "mobile" },
      { name: "desktop", width: 1280, height: 800, surface: "desktop" },
    ]) {
      const context = await browser.newContext({ viewport });
      const page = await context.newPage();
      const requests = { timeline: 0, news: 0 };
      page.on("request", (request) => {
        const pathname = new URL(request.url()).pathname;
        if (/\/api\/incidents\/[^/]+\/timeline$/.test(pathname)) requests.timeline += 1;
        if (/\/api\/incidents\/[^/]+\/news$/.test(pathname)) requests.news += 1;
      });

      try {
        await page.goto(`${baseUrl}/?incident=${encodeURIComponent(incidentId)}`, {
          waitUntil: "domcontentloaded",
          timeout: 30_000,
        });
        const detail = page.getByTestId("incident-detail-panel");
        await detail.waitFor({ state: "visible", timeout: 15_000 });
        if (await detail.count() !== 1) {
          throw new Error(`${viewport.name} mounted more than one incident detail surface`);
        }
        if (await detail.getAttribute("data-incident-surface") !== viewport.surface) {
          throw new Error(`${viewport.name} mounted the wrong incident detail surface`);
        }

        await page.waitForTimeout(1_000);
        if (requests.timeline !== 1 || requests.news !== 1) {
          throw new Error(`${viewport.name} expected one timeline/news request, got ${requests.timeline}/${requests.news}`);
        }
        console.log(`  ✓ ${viewport.name}: one detail surface and one timeline/news request`);
      } finally {
        await context.close();
      }
    }
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
