import { Issue, ComponentReport, SlopAuditReport, Category, Strictness } from "./types";

export const SEVERITY_WEIGHTS = {
  critical: 10,
  high: 5,
  medium: 2,
  low: 1,
};

export const COMPONENT_BUDGET = 30;

export const MULTIPLIERS: Record<Strictness, number> = {
  brutal: 1.5,
  balanced: 1.0,
  gentle: 0.5,
};

function finite(n: number, fallback = 0): number {
  return Number.isFinite(n) ? n : fallback;
}

export function scoreComponent(issues: Issue[], strictness: Strictness): number {
  const weighted = issues.reduce((sum, issue) => sum + SEVERITY_WEIGHTS[issue.severity], 0);
  const raw = (weighted * MULTIPLIERS[strictness]) / COMPONENT_BUDGET;
  const normalized = Math.round(finite(raw, 0) * 100);
  return Math.min(100, Math.max(0, normalized));
}

export function scoreCategory(components: ComponentReport[], category: Category): number {
  if (components.length === 0) return 0;
  const sum = components.reduce((acc, component) => {
    const hasIssue = component.issues.some((issue) => issue.category === category);
    return acc + (hasIssue ? component.slopIndex : 0);
  }, 0);
  return Math.round(sum / components.length);
}

function generateAdvice(offenses: Issue[]): string[] {
  const advice = new Set<string>();
  for (const issue of offenses.slice(0, 5)) {
    if (issue.advice) advice.add(issue.advice);
  }
  return Array.from(advice);
}

export function scoreProject(
  components: ComponentReport[],
  strictness: Strictness,
  configPath?: string
): SlopAuditReport {
  const categoryScores: Record<Category, number> = {
    visual: scoreCategory(components, "visual"),
    typography: scoreCategory(components, "typography"),
    spacing: scoreCategory(components, "spacing"),
    component: scoreCategory(components, "component"),
    logic: scoreCategory(components, "logic"),
    architecture: scoreCategory(components, "architecture"),
  };

  const slopIndex =
    components.length === 0
      ? 0
      : Math.round(components.reduce((sum, c) => sum + c.slopIndex, 0) / components.length);

  const allIssues = components.flatMap((c) => c.issues);
  const topOffenses = allIssues
    .sort((a, b) => SEVERITY_WEIGHTS[b.severity] - SEVERITY_WEIGHTS[a.severity])
    .slice(0, 10);

  return {
    version: "0.1.0",
    generatedAt: new Date().toISOString(),
    configPath,
    slopIndex,
    categoryScores,
    components,
    topOffenses,
    advice: generateAdvice(topOffenses),
    ignoredIssues: 0,
    unscannedFiles: [],
  };
}
