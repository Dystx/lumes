import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { appendRun, readLastRun, renderTrend } from "../../src/memory/log";
import { Category, SlopAuditReport } from "../../src/types";

describe("memory log", () => {
  let dir: string;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "slop-")); });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  function makeReport(slopIndex: number, scores: Record<Category, number>): SlopAuditReport {
    return {
      version: "0.1.0",
      generatedAt: new Date().toISOString(),
      configPath: undefined,
      slopIndex,
      categoryScores: scores,
      components: [],
      topOffenses: [],
      advice: [],
      ignoredIssues: 0,
      unscannedFiles: [],
    };
  }

  it("appends and reads runs", () => {
    const scores: Record<Category, number> = {
      visual: 10, typography: 0, spacing: 5, component: 0, logic: 0, architecture: 0,
    };
    appendRun(dir, makeReport(10, scores));
    const last = readLastRun(dir);
    expect(last?.slopIndex).toBe(10);
  });

  it("renders a trend", () => {
    const scores: Record<Category, number> = { visual: 0, typography: 0, spacing: 0, component: 0, logic: 0, architecture: 0 };
    appendRun(dir, makeReport(5, scores));
    appendRun(dir, makeReport(15, scores));
    const trend = renderTrend(dir, 10);
    expect(trend).toContain("last 2 runs");
    expect(trend).toMatch(/[\u2581-\u2588]/);
  });

  it("trims log to last 100 records", () => {
    const scores: Record<Category, number> = { visual: 0, typography: 0, spacing: 0, component: 0, logic: 0, architecture: 0 };
    for (let i = 0; i < 105; i++) {
      appendRun(dir, makeReport(i, scores));
    }
    const last = readLastRun(dir);
    expect(last?.slopIndex).toBe(104);
    const rendered = renderTrend(dir, 200);
    expect(rendered).toContain("last 100 runs");
  });

  it("flags threshold exceeded when a category score crosses the threshold", () => {
    const scores: Record<Category, number> = { visual: 40, typography: 0, spacing: 0, component: 0, logic: 0, architecture: 0 };
    appendRun(dir, makeReport(5, scores), { visual: 0.35, typography: 0.35, spacing: 0.35, component: 0.35, logic: 0.5, architecture: 0.5 });
    const last = readLastRun(dir);
    expect(last?.thresholdExceeded).toBe(true);
  });
});
