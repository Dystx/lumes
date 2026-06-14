import { describe, it, expect } from "vitest";
import { renderBadge } from "../../src/reporter/badge";
import { renderJson } from "../../src/reporter/json";
import { renderTerminal } from "../../src/reporter/terminal";
import { generateAdvice } from "../../src/reporter/advice";
import { SlopAuditReport, Issue, Category } from "../../src/types";

function makeReport(overrides: Partial<SlopAuditReport> = {}): SlopAuditReport {
  const categoryScores: Record<Category, number> = {
    visual: 40,
    typography: 20,
    spacing: 30,
    component: 10,
    logic: 50,
    architecture: 5,
  };
  const issues: Issue[] = [
    {
      ruleId: "arbitrary-tailwind",
      category: "visual",
      severity: "high",
      message: "arbitrary value",
      line: 1,
      column: 0,
      advice: "Use design-system tokens instead of bracket values.",
    },
    {
      ruleId: "inline-style",
      category: "visual",
      severity: "high",
      message: "inline style",
      line: 2,
      column: 0,
      advice: "Move styles to className or a design token.",
    },
    {
      ruleId: "off-grid-spacing",
      category: "spacing",
      severity: "medium",
      message: "off grid spacing",
      line: 3,
      column: 0,
      advice: "Use a spacing token that aligns to the base grid.",
    },
  ];
  return {
    version: "0.1.0",
    generatedAt: "2026-06-14T00:00:00.000Z",
    slopIndex: 42,
    categoryScores,
    components: [],
    topOffenses: issues,
    advice: issues.map((i) => i.advice).filter((a): a is string => Boolean(a)),
    ignoredIssues: 0,
    unscannedFiles: [],
    ...overrides,
  };
}

describe("reporter", () => {
  it("renders badge markdown", () => {
    expect(renderBadge(42)).toBe("[AI-Slop: 42%](https://slop-audit.dev)");
  });

  it("renders pretty JSON", () => {
    const report = makeReport({ slopIndex: 7 });
    const json = renderJson(report);
    const parsed = JSON.parse(json);
    expect(parsed.slopIndex).toBe(7);
    expect(json).toContain("\n");
  });

  it("renders terminal output with key text", () => {
    const report = makeReport();
    const out = renderTerminal(report);
    expect(out).toContain("AI-Slop Index: 42%");
    expect(out).toContain("Top offenses:");
    expect(out).toContain("Advice:");
    expect(out).toContain("https://slop-audit.dev");
  });

  it("suppresses advice in quiet mode", () => {
    const report = makeReport();
    const out = renderTerminal(report, { quiet: true });
    expect(out).toContain("AI-Slop Index: 42%");
    expect(out).not.toContain("Advice:");
    expect(out).not.toContain("https://brick.dev/rescue");
  });

  it("renders AI autopsy section when requested", () => {
    const report = makeReport();
    const out = renderTerminal(report, { aiAutopsy: true });
    expect(out).toContain("AI autopsy:");
    expect(out).toContain("Token bias");
    expect(out).toContain("arbitrary-tailwind");
  });

  it("deduplicates advice", () => {
    const issues: Issue[] = [
      {
        ruleId: "a",
        category: "visual",
        severity: "high",
        message: "m1",
        line: 1,
        column: 0,
        advice: "same advice",
      },
      {
        ruleId: "b",
        category: "visual",
        severity: "high",
        message: "m2",
        line: 2,
        column: 0,
        advice: "same advice",
      },
      {
        ruleId: "c",
        category: "visual",
        severity: "medium",
        message: "m3",
        line: 3,
        column: 0,
      },
    ];
    const advice = generateAdvice(issues);
    expect(advice).toEqual(["same advice"]);
  });
});
