import { minimatch } from "minimatch";
import type { Issue, Severity, SlopAuditConfig } from "../types.js";

export type Context = "legacy" | "allowedArbitrary" | "marketing" | "uiLibrary" | "new";

const SEVERITY_ORDER: Severity[] = ["low", "medium", "high", "critical"];

function lowerSeverity(severity: Severity): Severity {
  const index = SEVERITY_ORDER.indexOf(severity);
  return SEVERITY_ORDER[Math.max(0, index - 1)];
}

function raiseSeverity(severity: Severity): Severity {
  const index = SEVERITY_ORDER.indexOf(severity);
  return SEVERITY_ORDER[Math.min(SEVERITY_ORDER.length - 1, index + 1)];
}

function normalizePath(input: string): string {
  // Strip Windows drive letters, collapse separators, and remove a leading slash
  // so glob patterns like "src/legacy/**" match both absolute and relative paths.
  return input
    .replace(/\\/g, "/")
    .replace(/^[A-Za-z]:/, "")
    .replace(/\/{2,}/g, "/")
    .replace(/^\/+/, "");
}

function normalizePattern(pattern: string): string {
  // Allow user-provided globs to match anywhere in a path (e.g. "src/legacy/**"
  // should match both "src/legacy/Old.tsx" and "/project/src/legacy/Old.tsx").
  const trimmed = pattern.trim();
  if (trimmed.startsWith("**/") || trimmed.startsWith("/")) return trimmed;
  return `**/${trimmed}`;
}

function matchesAnyGlob(filePath: string, patterns: string[] | undefined): boolean {
  if (!patterns || patterns.length === 0) return false;
  const normalized = normalizePath(filePath);
  return patterns.some((pattern) =>
    minimatch(normalized, normalizePattern(pattern), { dot: true })
  );
}

export function classifyContext(filePath: string, config: SlopAuditConfig): Context {
  if (matchesAnyGlob(filePath, config.legacyPaths)) return "legacy";
  if (matchesAnyGlob(filePath, config.allowedArbitraryPaths)) return "allowedArbitrary";

  const lowerPath = filePath.toLowerCase();
  if (/marketing|landing|homepage|hero/.test(lowerPath)) return "marketing";

  if (config.uiLibrary) {
    const normalized = normalizePath(filePath).toLowerCase();
    if (
      /(^|\/)components\/ui\//.test(normalized) ||
      /(^|\/)ui\//.test(normalized) ||
      /(^|\/)design-system\//.test(normalized)
    ) {
      return "uiLibrary";
    }
  }

  return "new";
}

export function adjustSeverity(issue: Issue, context: Context): Severity {
  switch (context) {
    case "legacy":
      return lowerSeverity(issue.severity);
    case "allowedArbitrary":
      if (issue.ruleId.startsWith("arbitrary-")) {
        return lowerSeverity(issue.severity);
      }
      return issue.severity;
    case "marketing":
      if (issue.category === "visual") {
        return lowerSeverity(issue.severity);
      }
      return issue.severity;
    case "uiLibrary":
      if (issue.category === "component") {
        return raiseSeverity(issue.severity);
      }
      return issue.severity;
    case "new":
    default:
      return issue.severity;
  }
}
