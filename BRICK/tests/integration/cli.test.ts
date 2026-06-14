import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { readFileSync, unlinkSync, existsSync } from "node:fs";

const root = join(__dirname, "../..");
const bin = join(root, "bin/slop-audit.js");

function runCli(): unknown {
  const result = spawnSync(
    "node",
    [bin, root, "--include", "tests/fixtures/*.tsx", "--json", "-"],
    {
      cwd: root,
      encoding: "utf-8",
    }
  );

  if (result.error) {
    throw result.error;
  }

  const stdout = result.stdout.trim();
  if (!stdout) {
    throw new Error(
      `CLI produced no stdout (status ${result.status}). stderr: ${result.stderr}`
    );
  }

  return JSON.parse(stdout);
}

function runCliArgs(args: string[]) {
  return spawnSync("node", [bin, root, "--include", "tests/fixtures/*.tsx", ...args], {
    cwd: root,
    encoding: "utf-8",
  });
}

describe("CLI integration", () => {
  it("discovers all fixture components", () => {
    const report = runCli() as Record<string, any>;
    expect(report.components.length).toBeGreaterThanOrEqual(3);
    expect(report.slopIndex).toBeGreaterThan(0);
    expect(report.configPath).toBe(join(root, ".slop-audit.json"));
  });

  it("writes default JSON report file when --json has no value", () => {
    const outPath = join(root, "slop-audit-report.json");
    if (existsSync(outPath)) {
      unlinkSync(outPath);
    }

    const result = runCliArgs(["--json"]);
    expect(result.status).toBe(1);
    expect(existsSync(outPath)).toBe(true);

    const report = JSON.parse(readFileSync(outPath, "utf-8"));
    expect(report.slopIndex).toBeGreaterThan(0);

    unlinkSync(outPath);
  });

  it("reports low slop for the clean shadcn fixture", () => {
    const report = runCli() as Record<string, any>;
    const clean = report.components.find((c: any) =>
      c.file.endsWith("clean-shadcn.tsx")
    );

    expect(clean).toBeDefined();
    expect(clean.slopIndex).toBeLessThan(15);
    expect(clean.issues.length).toBeLessThan(2);
  });

  it("flags ai-landing with high visual slop", () => {
    const report = runCli() as Record<string, any>;
    const landing = report.components.find((c: any) =>
      c.file.endsWith("ai-landing.tsx")
    );

    expect(landing).toBeDefined();
    expect(landing.slopIndex).toBeGreaterThan(50);

    const ruleIds = landing.issues.map((i: any) => i.ruleId);
    expect(ruleIds).toEqual(
      expect.arrayContaining([
        "arbitrary-color",
        "no-gradient-hero",
        "no-glassmorphism",
        "max-radius",
        "off-grid-spacing",
        "generic-style-prop",
      ])
    );

    expect(report.categoryScores.visual).toBeGreaterThan(20);
  });

  it("flags vibe-dashboard with architecture and logic slop", () => {
    const report = runCli() as Record<string, any>;
    const dashboard = report.components.find((c: any) =>
      c.file.endsWith("vibe-dashboard.tsx")
    );

    expect(dashboard).toBeDefined();
    expect(dashboard.slopIndex).toBeGreaterThan(50);

    const ruleIds = dashboard.issues.map((i: any) => i.ruleId);
    expect(ruleIds).toEqual(
      expect.arrayContaining([
        "hallucinated-import",
        "placeholder-copy",
        "redundant-ai-comment",
        "inline-data-array",
        "ghost-use-effect",
        "excessive-use-effect",
        "div-on-click",
        "img-missing-alt",
        "magic-z-index",
        "negative-margin",
      ])
    );

    expect(report.categoryScores.architecture).toBeGreaterThan(0);
    expect(report.categoryScores.logic).toBeGreaterThan(0);
    expect(report.categoryScores.component).toBeGreaterThan(0);
  });

  it("exits with code 2 when --strict and critical/high issues exist", () => {
    const result = runCliArgs(["--strict"]);
    expect(result.status).toBe(2);
  });

  it("outputs badge markdown with --badge", () => {
    const result = runCliArgs(["--badge"]);
    expect(result.status).toBe(1);
    expect(result.stdout).toContain("[AI-Slop:");
    expect(result.stdout).toContain("](https://slop-audit.dev)");
  });

  it("suppresses advice/footer with --quiet", () => {
    const result = runCliArgs(["--quiet"]);
    expect(result.status).toBe(1);
    expect(result.stdout).not.toContain("Advice:");
    expect(result.stdout).not.toContain("https://slop-audit.dev");
    expect(result.stdout).not.toContain("https://brick.dev/rescue");
  });
});
