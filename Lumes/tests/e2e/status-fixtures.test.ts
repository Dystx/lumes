import { chromium, type Browser, type Page } from "playwright";
import { createServer, type Server } from "node:http";
import { once } from "node:events";
import { spawn, type ChildProcess } from "node:child_process";

type StatusFixture = {
  name: string;
  health: "ok" | "degraded";
  sourceCount: number;
  upstreamFailure?: boolean;
  malformedHealth?: boolean;
  malformedSources?: boolean;
  invalidSourceFields?: boolean;
};

const FIXTURES: StatusFixture[] = [
  { name: "healthy-available", health: "ok", sourceCount: 1 },
  { name: "healthy-empty", health: "ok", sourceCount: 0 },
  { name: "degraded-available", health: "degraded", sourceCount: 1 },
  { name: "degraded-empty", health: "degraded", sourceCount: 0 },
  { name: "upstream-fallback", health: "degraded", sourceCount: 0, upstreamFailure: true },
  { name: "malformed-success", health: "ok", sourceCount: 1, malformedHealth: true, malformedSources: true },
  { name: "invalid-source-fields", health: "ok", sourceCount: 1, invalidSourceFields: true },
];

const VIEWPORTS = [
  { width: 320, height: 568 },
  { width: 390, height: 844 },
] as const;

let activeFixture = FIXTURES[0];

function json(res: import("node:http").ServerResponse, status: number, payload: unknown): void {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(payload));
}

function createFixtureServer(): Server {
  return createServer((req, res) => {
    if (activeFixture.upstreamFailure) {
      json(res, 503, { error: "fixture upstream unavailable" });
      return;
    }

    if (req.url === "/api/health") {
      if (activeFixture.malformedHealth) {
        json(res, 200, {
          status: "ok",
          timestamp: "not-a-date",
          uptime_s: "unknown",
          latencyMs: 2,
          checks: { database: "unknown" },
          lastIncidentUpdate: "also-not-a-date",
        });
        return;
      }
      json(res, 200, {
        status: activeFixture.health,
        timestamp: "2026-07-12T00:00:00.000Z",
        uptime_s: 10,
        latencyMs: 2,
        checks: { database: activeFixture.health === "ok" ? "ok" : "fail" },
        lastIncidentUpdate: null,
      });
      return;
    }
    if (req.url === "/api/stats") {
      json(res, 200, { total: 12, active: 3, resolved: 9, snapshots: 4 });
      return;
    }
    if (req.url === "/api/source-health") {
      if (activeFixture.malformedSources) {
        json(res, 200, { sources: "not-an-array" });
        return;
      }
      json(res, 200, {
        sources: Array.from({ length: activeFixture.sourceCount }, (_, index) => ({
          sourceId: `fixture-${index}`,
          sourceName: `Fixture source ${index}`,
          status: activeFixture.health === "ok" ? "ok" : "stale",
          lastSuccess: activeFixture.invalidSourceFields ? "not-a-date" : null,
          lastError: null,
          recordCount: 12,
          latencyMs: activeFixture.invalidSourceFields ? "slow" : 8,
        })),
      });
      return;
    }
    json(res, 404, { error: "fixture route not found" });
  });
}

async function listen(server: Server): Promise<number> {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("fixture server did not expose a port");
  return address.port;
}

async function waitForNext(url: string, child: ChildProcess): Promise<void> {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Next fixture server exited with ${child.exitCode}`);
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(2_000) });
      if (response.ok) return;
    } catch {
      // Server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function stopNext(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null) return;
  child.kill("SIGTERM");
  await Promise.race([
    once(child, "exit"),
    new Promise((resolve) => setTimeout(resolve, 10_000)),
  ]);
  if (child.exitCode === null) child.kill("SIGKILL");
}

type FixtureServerMode = "dev" | "start";

function requestedFixtureServerMode(): FixtureServerMode {
  const requested = process.env.LUMES_STATUS_FIXTURE_MODE ?? "dev";
  if (requested !== "dev" && requested !== "start") {
    throw new Error(`Unsupported LUMES_STATUS_FIXTURE_MODE: ${requested}`);
  }
  return requested;
}

async function assertFixture(page: Page, fixture: StatusFixture): Promise<void> {
  const expectedOverall = fixture.upstreamFailure || fixture.malformedHealth ? "degraded" : fixture.health;
  const expectedSources = fixture.upstreamFailure || fixture.sourceCount === 0 || fixture.malformedSources ? "empty" : "available";
  const status = page.locator('[data-status-state="ok"]:visible, [data-status-state="degraded"]:visible').first();
  await status.waitFor({ state: "visible", timeout: 10_000 });
  if (await status.getAttribute("data-status-state") !== expectedOverall) {
    throw new Error(`${fixture.name}: unexpected overall status`);
  }
  const sources = page.locator("[data-status-sources-state]:visible").first();
  await sources.waitFor({ state: "visible", timeout: 10_000 });
  if (await sources.getAttribute("data-status-sources-state") !== expectedSources) {
    throw new Error(`${fixture.name}: unexpected source state`);
  }
  if (await page.locator("html").getAttribute("lang") !== "pt-PT") {
    throw new Error(`${fixture.name}: public locale changed unexpectedly`);
  }
  if ((await page.locator("body").innerText()).includes("Invalid Date")) {
    throw new Error(`${fixture.name}: invalid date leaked into the page`);
  }
  if (fixture.invalidSourceFields) {
    const sourceRow = page.getByText("Fixture source 0").locator("..").locator("..");
    const sourceText = await sourceRow.innerText();
    if (!sourceText.includes("—")) throw new Error(`${fixture.name}: invalid latency did not render as unavailable`);
  }
}

async function main(): Promise<void> {
  const upstream = createFixtureServer();
  const upstreamPort = await listen(upstream);
  const nextPortServer = createServer();
  const nextPort = await listen(nextPortServer);
  await new Promise<void>((resolve) => nextPortServer.close(() => resolve()));

  const mode = requestedFixtureServerMode();
  const next = spawn("bun", ["x", "next", mode === "start" ? "start" : "dev", "-p", String(nextPort)], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      LUMES_STATUS_BASE_URL: `http://127.0.0.1:${upstreamPort}`,
      NEXT_PUBLIC_BASE_URL: `http://127.0.0.1:${upstreamPort}`,
      NEXT_TELEMETRY_DISABLED: "1",
      PORT: String(nextPort),
    },
    stdio: "ignore",
  });

  let browser: Browser | null = null;
  try {
    console.log(`status fixture server mode: ${mode}`);
    const baseUrl = `http://127.0.0.1:${nextPort}`;
    await waitForNext(`${baseUrl}/status`, next);
    browser = await chromium.launch({ headless: true });

    for (const fixture of FIXTURES) {
      activeFixture = fixture;
      for (const viewport of VIEWPORTS) {
        for (const theme of ["dark", "light"] as const) {
          const context = await browser.newContext({ viewport });
          await context.addInitScript((nextTheme) => {
            window.localStorage.setItem("theme", nextTheme);
          }, theme);
          const page = await context.newPage();
          await page.goto(`${baseUrl}/status?fixture=${fixture.name}`, { waitUntil: "domcontentloaded", timeout: 30_000 });
          if (!(await page.locator(`html.${theme}`).count())) throw new Error(`${fixture.name}: ${theme} theme missing`);
          await assertFixture(page, fixture);
          await context.close();
          console.log(`  ✓ ${fixture.name} ${viewport.width}x${viewport.height} ${theme}`);
        }
      }
    }
  } finally {
    await browser?.close();
    await stopNext(next);
    await new Promise<void>((resolve) => upstream.close(() => resolve()));
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
