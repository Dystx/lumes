import { describe, it, expect, vi } from "vitest";
import { join } from "node:path";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import {
  defaultConfig,
  validateConfig,
} from "../../src/config/schema";
import { loadConfig, saveConfig } from "../../src/config/loader";
import { runWizard, isCancelError, type WizardPrompts } from "../../src/config/wizard";

describe("config schema", () => {
  it("provides sensible defaults", () => {
    expect(defaultConfig.framework).toBe("react");
    expect(defaultConfig.baseSpacing).toBe(4);
    expect(defaultConfig.strictness).toBe("balanced");
  });

  it("rejects invalid strictness", () => {
    expect(() => validateConfig({ strictness: "medium" })).toThrow();
  });

  it("rejects invalid framework", () => {
    expect(() => validateConfig({ framework: "angular" })).toThrow();
  });

  it("merges nested rules", () => {
    const cfg = validateConfig({ rules: { maxProps: 5 } });
    expect(cfg.rules.maxProps).toBe(5);
    expect(cfg.rules.maxUseEffectPerComponent).toBe(
      defaultConfig.rules.maxUseEffectPerComponent
    );
  });
});

describe("config loader", () => {
  it("returns defaults when no config file exists", () => {
    const tmp = mkdtempSync(join(tmpdir(), "slop-audit-"));
    try {
      const cfg = loadConfig(tmp);
      expect(cfg).toEqual(defaultConfig);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("merges user config from .slop-audit.json", () => {
    const fixtureDir = join(__dirname, "../fixtures");
    const cfg = loadConfig(fixtureDir);
    expect(cfg.baseSpacing).toBe(8);
    expect(cfg.include).toEqual(["app/**/*"]);
    expect(cfg.rules.maxComponentLines).toBe(300);
    expect(cfg.rules.maxUseEffectPerComponent).toBe(
      defaultConfig.rules.maxUseEffectPerComponent
    );
  });

  it("saves and reloads config", () => {
    const tmp = mkdtempSync(join(tmpdir(), "slop-audit-"));
    try {
      const custom = validateConfig({
        framework: "solid",
        styling: "plain",
        baseSpacing: 8,
        include: ["lib/**/*"],
        rules: { maxProps: 5 },
      });
      saveConfig(tmp, custom);
      const reloaded = loadConfig(tmp);
      expect(reloaded.framework).toBe("solid");
      expect(reloaded.styling).toBe("plain");
      expect(reloaded.baseSpacing).toBe(8);
      expect(reloaded.include).toEqual(["lib/**/*"]);
      expect(reloaded.rules.maxProps).toBe(5);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("throws when a custom config path is missing", () => {
    const tmp = mkdtempSync(join(tmpdir(), "slop-audit-"));
    try {
      expect(() => loadConfig(tmp, "missing.json")).toThrow(
        "Config file not found"
      );
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});

describe("config wizard", () => {
  it("returns a complete SlopAuditConfig", async () => {
    const answers: Record<string, unknown> = {
      framework: "react",
      styling: "tailwind",
      uiLibrary: "shadcn/ui",
      baseSpacing: 4,
      typeScaleRatio: "1.25",
      arbitraryTolerance: "strict",
      scanPaths: "auto",
      strictness: "brutal",
    };

    const prompts: WizardPrompts = {
      select: vi.fn(async (opts) => (answers[opts.name ?? ""] as string) ?? ""),
      input: vi.fn(async (opts) => (answers[opts.name ?? ""] as string) ?? ""),
      number: vi.fn(
        async (opts) => (answers[opts.name ?? ""] as number) ?? 0
      ),
    };

    const cfg = await runWizard(prompts);

    expect(cfg.framework).toBe("react");
    expect(cfg.styling).toBe("tailwind");
    expect(cfg.uiLibrary).toBe("shadcn/ui");
    expect(cfg.baseSpacing).toBe(4);
    expect(cfg.typeScaleRatio).toBe(1.25);
    expect(cfg.arbitraryTolerance).toBe("strict");
    expect(cfg.strictness).toBe("brutal");
    expect(cfg.include).toEqual(defaultConfig.include);
    expect(cfg.exclude).toEqual(defaultConfig.exclude);
    expect(cfg.disabledRules).toEqual([]);
    expect(cfg.bannedDefaults).toBe(true);
    expect(cfg.projectMemory).toBe(true);
    expect(cfg.categoryThresholds).toEqual(defaultConfig.categoryThresholds);
    expect(cfg.componentRegistry).toEqual(defaultConfig.componentRegistry);
    expect(cfg.rules).toEqual(defaultConfig.rules);
  });

  it("uses custom glob patterns when scanPaths is custom", async () => {
    const answers: Record<string, unknown> = {
      framework: "vue",
      styling: "css-modules",
      uiLibrary: "None",
      baseSpacing: 8,
      typeScaleRatio: "1.2",
      arbitraryTolerance: "balanced",
      scanPaths: "custom",
      customGlobs: "src/**/*, components/**/*",
      strictness: "gentle",
    };

    const prompts: WizardPrompts = {
      select: vi.fn(async (opts) => (answers[opts.name ?? ""] as string) ?? ""),
      input: vi.fn(async (opts) => (answers[opts.name ?? ""] as string) ?? ""),
      number: vi.fn(
        async (opts) => (answers[opts.name ?? ""] as number) ?? 0
      ),
    };

    const cfg = await runWizard(prompts);
    expect(cfg.framework).toBe("vue");
    expect(cfg.include).toEqual(["src/**/*", "components/**/*"]);
  });

  it("identifies ExitPromptError by name", () => {
    const cancel = new Error("User cancelled");
    cancel.name = "ExitPromptError";
    expect(isCancelError(cancel)).toBe(true);
    expect(isCancelError(new Error("other"))).toBe(false);
  });
});
