import { isAbsolute, relative } from 'node:path';
import type {
  BaselineCache,
  Category,
  ComponentScore,
  FileScanResult,
  ProjectReport,
  ResolvedConfig,
  Severity,
} from '../types';


export const SEVERITY_WEIGHTS: Record<Severity, number> = {
  low: 1,
  medium: 3,
  high: 5,
};

export function contextTax(
  nodeCount: number,
  hasHighSeverity: boolean,
  caps: { cleanCap: number; standardCap: number },
): number {
  const base = 1 + Math.log(1 + Math.max(0, nodeCount - 100)) / Math.log(2500);
  const cap = hasHighSeverity ? caps.standardCap : caps.cleanCap;
  return Math.min(base, cap);
}

export function sizeNormalization(componentCount: number): number {
  if (componentCount === 0) return 0;
  if (componentCount <= 10) return 1.0;
  return Math.min(1, Math.log10(1 + componentCount) / Math.log10(10001));
}

function p90(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.ceil(0.9 * sorted.length) - 1;
  return sorted[Math.max(0, index)];
}

export function resolveFrameworkMultiplier(config: ResolvedConfig): number {
  const framework = config.framework ?? 'react';
  return config.frameworkMultipliers[framework] ?? 1.0;
}

export function scoreFile(
  result: FileScanResult,
  frameworkMultiplier: number,
  config: ResolvedConfig,
  baseline?: BaselineCache,
  cwd?: string,
): ComponentScore {
  const groups = new Map<string, { weightedSum: number; count: number }>();
  for (const issue of result.issues) {
    const entry = groups.get(issue.ruleId) ?? { weightedSum: 0, count: 0 };
    const weight = SEVERITY_WEIGHTS[issue.severity] * (config.categoryWeights?.[issue.category] ?? 1);
    entry.weightedSum += weight;
    entry.count += 1;
    groups.set(issue.ruleId, entry);
  }

  let rawScore = 0;
  for (const { weightedSum, count } of groups.values()) {
    rawScore += weightedSum * (1 + Math.log10(count));
  }

  const hasHighSeverity = result.issues.some((issue) => issue.severity === 'high');
  const tax = contextTax(result.astNodeCount, hasHighSeverity, config.contextTaxCaps);
  const componentScore = Math.min(100, rawScore * frameworkMultiplier * tax);
  const baselineKey = cwd
    ? isAbsolute(result.filePath)
      ? relative(cwd, result.filePath)
      : result.filePath
    : result.filePath;
  const baselineScore = baseline?.scores[baselineKey]?.baselineScore ?? 0;
  const adjustedScore = baseline ? Math.max(0, componentScore - baselineScore) : componentScore;

  return {
    filePath: result.filePath,
    rawScore,
    componentScore,
    adjustedScore,
    componentCount: result.componentCount,
  };
}

export function aggregateReport(
  scores: ComponentScore[],
  issueGroups: Array<{ filePath: string; issues: Array<{ category: Category; severity: Severity; ruleId: string }> }>,
  config: ResolvedConfig,
): Pick<
  ProjectReport,
  | 'slopIndex'
  | 'assemblyHealth'
  | 'categoryScores'
  | 'p90Score'
  | 'peakScore'
  | 'componentCount'
  | 'components'
> {
  const adjustedScores = scores.map((score) => score.adjustedScore);
  const mean =
    adjustedScores.length === 0
      ? 0
      : adjustedScores.reduce((a, b) => a + b, 0) / adjustedScores.length;

  const componentCount = scores.reduce((sum, score) => sum + score.componentCount, 0);
  const norm = sizeNormalization(componentCount);
  const p90Score = p90(adjustedScores);
  const blended = (mean + 0.5 * p90Score) / 1.5;
  const slopIndex = blended * norm;
  const assemblyHealth = 100 - slopIndex;

  const peak =
    adjustedScores.length === 0 ? 0 : Math.max(...adjustedScores);

  const categoryContributions: Record<Category, number> = {
    visual: 0,
    typo: 0,
    wcag: 0,
    layout: 0,
    component: 0,
    logic: 0,
    arch: 0,
    perf: 0,
  };

  const categoryWeights = config.categoryWeights ?? {} as Record<Category, number>;

  for (let i = 0; i < scores.length; i++) {
    const score = scores[i];
    const group = issueGroups[i];

    const ruleGroups = new Map<string, { count: number; weightedSum: number }>();
    for (const issue of group.issues) {
      const entry = ruleGroups.get(issue.ruleId) ?? { count: 0, weightedSum: 0 };
      const weight = SEVERITY_WEIGHTS[issue.severity] * (categoryWeights[issue.category] ?? 1);
      entry.count += 1;
      entry.weightedSum += weight;
      ruleGroups.set(issue.ruleId, entry);
    }

    let groupWeightedSum = 0;
    for (const entry of ruleGroups.values()) {
      const density = 1 + Math.log10(entry.count);
      groupWeightedSum += entry.weightedSum * density;
    }

    if (groupWeightedSum === 0 || score.adjustedScore === 0) continue;

    for (const issue of group.issues) {
      const entry = ruleGroups.get(issue.ruleId)!;
      const density = 1 + Math.log10(entry.count);
      const weighted = SEVERITY_WEIGHTS[issue.severity] * (categoryWeights[issue.category] ?? 1) * density;
      const share = weighted / groupWeightedSum;
      categoryContributions[issue.category] += score.adjustedScore * share;
    }
  }

  const denominator = componentCount || 1;
  const categoryScores: Record<Category, number> = { ...categoryContributions };
  for (const category of Object.keys(categoryScores) as Category[]) {
    categoryScores[category] /= denominator;
  }

  return {
    slopIndex,
    assemblyHealth,
    categoryScores,
    p90Score,
    peakScore: peak,
    componentCount,
    components: [...scores],
  };
}
