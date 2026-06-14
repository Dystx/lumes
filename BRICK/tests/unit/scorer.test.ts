import { describe, it, expect } from "vitest";
import { scoreComponent, scoreCategory, scoreProject, SEVERITY_WEIGHTS, MULTIPLIERS, COMPONENT_BUDGET } from "../../src/scorer";
import { Issue, Strictness, ComponentReport, Category } from "../../src/types";

function makeIssue(severity: Issue["severity"], category: Category = "visual", overrides: Partial<Issue> = {}): Issue {
  return {
    ruleId: "test-rule",
    category,
    severity,
    message: "test issue",
    line: 1,
    column: 0,
    ...overrides,
  };
}

function makeComponent(slopIndex: number, issues: Issue[]): ComponentReport {
  return {
    file: "test.tsx",
    name: "Test",
    line: 1,
    slopIndex,
    issues,
  };
}

describe("scorer", () => {
  it("exports expected constants", () => {
    expect(SEVERITY_WEIGHTS).toEqual({ critical: 10, high: 5, medium: 2, low: 1 });
    expect(COMPONENT_BUDGET).toBe(30);
    expect(MULTIPLIERS).toEqual({ brutal: 1.5, balanced: 1.0, gentle: 0.5 });
  });

  it("returns 0 for a component with no issues", () => {
    expect(scoreComponent([], "balanced")).toBe(0);
  });

  it("caps component score at 100", () => {
    const issues: Issue[] = Array.from({ length: 20 }, (_, i) => makeIssue("critical", "visual", { line: i }));
    expect(scoreComponent(issues, "balanced")).toBe(100);
  });

  it("scores a single critical issue correctly under balanced strictness", () => {
    // weighted=10, multiplier=1.0, budget=30 => 10/30*100 = 33.33 => 33
    expect(scoreComponent([makeIssue("critical")], "balanced")).toBe(33);
  });

  it("applies strictness multipliers", () => {
    const issues = [makeIssue("high")]; // weighted=5
    // balanced: 5/30*100 = 16.67 => 17
    expect(scoreComponent(issues, "balanced")).toBe(17);
    // brutal: 5*1.5/30*100 = 25
    expect(scoreComponent(issues, "brutal")).toBe(25);
    // gentle: 5*0.5/30*100 = 8.33 => 8
    expect(scoreComponent(issues, "gentle")).toBe(8);
  });

  it("guards against NaN/Infinity", () => {
    // Passing an invalid strictness would index undefined, but TypeScript prevents that.
    // We verify that a normal calculation never produces NaN/Infinity.
    const result = scoreComponent([], "balanced");
    expect(Number.isFinite(result)).toBe(true);
    expect(Number.isNaN(result)).toBe(false);
  });

  it("averages project scores", () => {
    const report = scoreProject([makeComponent(0, [])], "balanced");
    expect(report.slopIndex).toBe(0);
  });

  it("returns empty report for no components", () => {
    const report = scoreProject([], "balanced");
    expect(report.slopIndex).toBe(0);
    expect(report.categoryScores).toEqual({
      visual: 0,
      typography: 0,
      spacing: 0,
      component: 0,
      logic: 0,
      architecture: 0,
    });
    expect(report.topOffenses).toEqual([]);
    expect(report.advice).toEqual([]);
    expect(report.ignoredIssues).toBe(0);
    expect(report.unscannedFiles).toEqual([]);
    expect(report.configPath).toBeUndefined();
  });

  it("includes configPath when provided", () => {
    const report = scoreProject([], "balanced", "/project/.slop-audit.json");
    expect(report.configPath).toBe("/project/.slop-audit.json");
  });

  it("computes category scores by averaging affected component slopIndex", () => {
    const visualIssue = makeIssue("high", "visual");
    const spacingIssue = makeIssue("medium", "spacing");

    const components: ComponentReport[] = [
      makeComponent(17, [visualIssue]),
      makeComponent(7, [spacingIssue]),
      makeComponent(0, []),
    ];

    expect(scoreCategory(components, "visual")).toBe(Math.round((17 + 0 + 0) / 3));
    expect(scoreCategory(components, "spacing")).toBe(Math.round((0 + 7 + 0) / 3));
    expect(scoreCategory(components, "logic")).toBe(0);
  });

  it("sorts top offenses by severity", () => {
    const issues: Issue[] = [
      makeIssue("low", "visual", { ruleId: "low-1" }),
      makeIssue("critical", "logic", { ruleId: "critical-1" }),
      makeIssue("high", "component", { ruleId: "high-1" }),
    ];
    const report = scoreProject([makeComponent(100, issues)], "balanced");
    expect(report.topOffenses.map((i) => i.ruleId)).toEqual(["critical-1", "high-1", "low-1"]);
  });

  it("collects advice from top offenses without duplicates", () => {
    const issues: Issue[] = [
      makeIssue("high", "visual", { advice: "Use tokens." }),
      makeIssue("high", "spacing", { advice: "Use tokens." }),
      makeIssue("medium", "component", { advice: "Use a button." }),
    ];
    const report = scoreProject([makeComponent(100, issues)], "balanced");
    expect(report.advice).toEqual(["Use tokens.", "Use a button."]);
  });
});
