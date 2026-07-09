// Accessibility smoke tests using Playwright + axe-core.
//
// These run against a locally-served dev server (or production URL via LUMES_URL).
// Not run by `bun run test` (vitest unit suite) — invoke directly:
//
//   bun run tests/e2e/a11y.test.ts
//
// Setup:
//   cd tests/e2e && bun install && bun run a11y.ts
//
// For CI, set LUMES_URL=https://staging.lumes.pt and run.

import { chromium, type Browser } from "playwright";
import { AxeBuilder } from "@axe-core/playwright";

const BASE_URL = process.env.LUMES_URL ?? "http://localhost:3000";

interface Failure {
  url: string;
  viewport: string;
  rule: string;
  impact: string;
  help: string;
  nodes: number;
}

async function audit(browser: Browser, viewport: string, url: string): Promise<Failure[]> {
  const ctx = await browser.newContext({ viewport: parseViewport(viewport) });
  const page = await ctx.newPage();
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.waitForTimeout(5000); // wait for client hydration
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  await ctx.close();
  return results.violations.map((v) => ({
    url,
    viewport,
    rule: v.id,
    impact: v.impact ?? "unknown",
    help: v.help,
    nodes: v.nodes.length,
  }));
}

function parseViewport(s: string): { width: number; height: number } {
  const [w, h] = s.split("x").map(Number);
  return { width: w, height: h };
}

const VIEWPORTS = [
  { name: "small", w: "320x568" },
  { name: "mobile", w: "390x844" },
  { name: "tablet", w: "768x1024" },
  { name: "landscape", w: "1024x768" },
  { name: "desktop", w: "1280x800" },
  { name: "wide", w: "1440x900" },
];

const URLS = [
  "/",
  "/status",
  "/newsletter",
  "/privacy",
];

async function main() {
  console.log(`\nA11y audit: ${BASE_URL}\n`);
  const browser = await chromium.launch({ headless: true });
  let totalFailures = 0;
  for (const { name, w } of VIEWPORTS) {
    for (const path of URLS) {
      const url = `${BASE_URL}${path}`;
      const failures = await audit(browser, w, url);
      if (failures.length === 0) {
        console.log(`  ✓ [${name.padEnd(7)}] ${path}`);
      } else {
        console.log(`  ✗ [${name.padEnd(7)}] ${path} — ${failures.length} violation(s):`);
        for (const f of failures) {
          console.log(`      • [${f.impact}] ${f.rule}: ${f.help} (${f.nodes} nodes)`);
        }
        totalFailures += failures.length;
      }
    }
  }
  await browser.close();
  console.log(`\nTotal violations: ${totalFailures}`);
  if (totalFailures > 0) {
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
