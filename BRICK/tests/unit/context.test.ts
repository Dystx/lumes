import { describe, it, expect } from "vitest";
import { classifyContext, adjustSeverity, Context } from "../../src/context/classifier.js";
import type { Issue, Severity, SlopAuditConfig } from "../../src/types.js";

function baseConfig(overrides: Partial<SlopAuditConfig> = {}): SlopAuditConfig {
  return {
    framework: "react",
    styling: "tailwind",
    uiLibrary: "shadcn/ui",
    baseSpacing: 4,
    typeScaleRatio: 1.2,
    arbitraryTolerance: "balanced",
    strictness: "balanced",
    include: ["src/**/*"],
    exclude: [],
    legacyPaths: ["src/legacy/**"],
    allowedArbitraryPaths: ["app/(marketing)/**"],
    componentRegistry: {},
    disabledRules: [],
    bannedDefaults: true,
    projectMemory: true,
    categoryThresholds: {
      visual: 0.35,
      typography: 0.35,
      spacing: 0.35,
      component: 0.35,
      logic: 0.5,
      architecture: 0.5,
    },
    rules: {
      maxUseEffectPerComponent: 3,
      maxComponentLines: 500,
      maxJsxNestingDepth: 6,
      maxDirectChildren: 10,
      maxProps: 10,
      contrastMethod: "wcag2",
      contrastTarget: 4.5,
    },
    ...overrides,
  };
}

function issue(
  ruleId: string,
  category: Issue["category"],
  severity: Severity
): Issue {
  return {
    ruleId,
    category,
    severity,
    message: "test",
    line: 1,
    column: 1,
  };
}

describe("classifyContext", () => {
  it("classifies legacy paths from globs", () => {
    const config = baseConfig();
    expect(classifyContext("src/legacy/Old.tsx", config)).toBe("legacy");
    expect(classifyContext("/project/src/legacy/Old.tsx", config)).toBe("legacy");
  });

  it("classifies allowed arbitrary paths from globs", () => {
    const config = baseConfig();
    expect(classifyContext("app/(marketing)/page.tsx", config)).toBe(
      "allowedArbitrary"
    );
  });

  it("classifies marketing paths by substring", () => {
    const config = baseConfig({ legacyPaths: [], allowedArbitraryPaths: [] });
    expect(classifyContext("src/pages/Landing.tsx", config)).toBe("marketing");
    expect(classifyContext("src/marketing/Banner.tsx", config)).toBe("marketing");
    expect(classifyContext("src/homepage/Hero.tsx", config)).toBe("marketing");
    expect(classifyContext("app/hero-section.tsx", config)).toBe("marketing");
  });

  it("classifies UI library paths when config.uiLibrary is set", () => {
    const config = baseConfig({ legacyPaths: [], allowedArbitraryPaths: [] });
    expect(classifyContext("components/ui/Button.tsx", config)).toBe("uiLibrary");
    expect(classifyContext("src/components/ui/Card.tsx", config)).toBe("uiLibrary");
  });

  it("classifies design-system paths when config.uiLibrary is set", () => {
    const config = baseConfig({ legacyPaths: [], allowedArbitraryPaths: [] });
    expect(classifyContext("design-system/Button.tsx", config)).toBe("uiLibrary");
    expect(classifyContext("src/design-system/Card.tsx", config)).toBe("uiLibrary");
  });

  it("does not classify as uiLibrary when config.uiLibrary is unset", () => {
    const config = baseConfig({
      uiLibrary: undefined,
      legacyPaths: [],
      allowedArbitraryPaths: [],
    });
    expect(classifyContext("components/ui/Button.tsx", config)).toBe("new");
    expect(classifyContext("design-system/Button.tsx", config)).toBe("new");
  });

  it("falls back to new for unmatched paths", () => {
    const config = baseConfig({ legacyPaths: [], allowedArbitraryPaths: [] });
    expect(classifyContext("src/components/Card.tsx", config)).toBe("new");
    expect(classifyContext("/project/src/components/Card.tsx", config)).toBe("new");
  });
});

describe("adjustSeverity", () => {
  it("downgrades severity in legacy context", () => {
    const ctx: Context = "legacy";
    expect(adjustSeverity(issue("x", "visual", "critical"), ctx)).toBe("high");
    expect(adjustSeverity(issue("x", "visual", "high"), ctx)).toBe("medium");
    expect(adjustSeverity(issue("x", "visual", "medium"), ctx)).toBe("low");
    expect(adjustSeverity(issue("x", "visual", "low"), ctx)).toBe("low");
  });

  it("downgrades arbitrary-* rules in allowedArbitrary context", () => {
    const ctx: Context = "allowedArbitrary";
    expect(adjustSeverity(issue("arbitrary-color", "visual", "high"), ctx)).toBe(
      "medium"
    );
    expect(adjustSeverity(issue("arbitrary-tailwind-value", "visual", "medium"), ctx)).toBe(
      "low"
    );
    expect(adjustSeverity(issue("inline-style-prop", "visual", "high"), ctx)).toBe(
      "high"
    );
  });

  it("downgrades visual category issues in marketing context", () => {
    const ctx: Context = "marketing";
    expect(adjustSeverity(issue("inline-style-prop", "visual", "high"), ctx)).toBe(
      "medium"
    );
    expect(adjustSeverity(issue("div-on-click", "component", "high"), ctx)).toBe(
      "high"
    );
  });

  it("upgrades component category issues in uiLibrary context", () => {
    const ctx: Context = "uiLibrary";
    expect(adjustSeverity(issue("div-on-click", "component", "high"), ctx)).toBe(
      "critical"
    );
    expect(adjustSeverity(issue("div-on-click", "component", "low"), ctx)).toBe(
      "medium"
    );
    expect(adjustSeverity(issue("inline-style-prop", "visual", "high"), ctx)).toBe(
      "high"
    );
    expect(adjustSeverity(issue("x", "component", "critical"), ctx)).toBe("critical");
  });

  it("leaves severity unchanged in new context", () => {
    const ctx: Context = "new";
    for (const severity of ["critical", "high", "medium", "low"] as Severity[]) {
      expect(adjustSeverity(issue("x", "visual", severity), ctx)).toBe(severity);
    }
  });

  it("preserves the rest of the issue object", () => {
    const original = issue("arbitrary-color", "visual", "high");
    const adjusted = { ...original, severity: adjustSeverity(original, "legacy") };
    expect(adjusted.ruleId).toBe("arbitrary-color");
    expect(adjusted.category).toBe("visual");
    expect(adjusted.message).toBe("test");
    expect(adjusted.severity).toBe("medium");
  });
});
