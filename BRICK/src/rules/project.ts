import type { FileScanResult, Issue, ResolvedConfig } from '../types';

function isRuleEnabled(config: ResolvedConfig, id: string): boolean {
  const severity = config.rules[id];
  return severity !== undefined && severity !== 'off';
}

function createProjectIssue(
  id: string,
  category: Issue['category'],
  severity: Issue['severity'],
  aiSpecific: boolean,
  message: string,
  advice?: string,
): Issue {
  return {
    ruleId: id,
    category,
    severity,
    aiSpecific,
    message,
    line: 1,
    column: 1,
    advice,
  };
}

export function analyzeGapMonopoly(results: FileScanResult[], config: ResolvedConfig): Issue[] {
  const id = 'layout/gap-monopoly';
  if (!isRuleEnabled(config, id)) return [];

  const gapValues: string[] = [];
  let containerCount = 0;
  for (const result of results) {
    const values = result.gapValues ?? [];
    gapValues.push(...values);
    containerCount += result.gapContainerCount ?? (values.length > 0 ? 1 : 0);
  }

  if (containerCount === 0) return [];

  const total = gapValues.length;
  if (total === 0) return [];

  const freq = new Map<string, number>();
  let maxFreq = 0;
  let dominantValue = '';
  for (const val of gapValues) {
    const next = (freq.get(val) ?? 0) + 1;
    freq.set(val, next);
    if (next > maxFreq) {
      maxFreq = next;
      dominantValue = val;
    }
  }

  const ratio = maxFreq / total;
  const designSystemRestricted =
    Array.isArray(config.gapTokens) && config.gapTokens.length >= 1 && config.gapTokens.length <= 3;
  const tolerance = designSystemRestricted ? 0.95 : containerCount < 20 ? 0.85 : 0.7;

  if (ratio <= tolerance) return [];

  const score = (ratio - tolerance) / (1 - tolerance);
  if (score <= 0.5) return [];

  return [
    createProjectIssue(
      id,
      'layout',
      config.rules[id] as Issue['severity'],
      true,
      `Gap value "${dominantValue}" dominates ${Math.round(ratio * 100)}% of ${containerCount} gap-declaring containers (score ${score.toFixed(2)}).`,
      'Introduce more spacing variety or document the intentional uniform spacing system in config.gapTokens.',
    ),
  ];
}

function normalizeStyleSource(source: string): string {
  return source.replace(/\s+/g, ' ').trim();
}

export function analyzeCssBloat(results: FileScanResult[], config: ResolvedConfig): Issue[] {
  const id = 'perf/css-bloat';
  if (!isRuleEnabled(config, id)) return [];

  const occurrences = new Map<string, { count: number; files: Set<string> }>();

  for (const result of results) {
    for (const source of result.styleSources ?? []) {
      const normalized = normalizeStyleSource(source);
      if (!normalized) continue;
      const entry = occurrences.get(normalized);
      if (entry) {
        entry.count++;
        entry.files.add(result.filePath);
      } else {
        occurrences.set(normalized, { count: 1, files: new Set([result.filePath]) });
      }
    }
  }

  const issues: Issue[] = [];
  for (const [normalized, { count, files }] of occurrences) {
    if (count > 5 && files.size > 1) {
      issues.push(
        createProjectIssue(
          id,
          'perf',
          config.rules[id] as Issue['severity'],
          false,
          `Identical style block repeated ${count} times across ${files.size} files.`,
          'Extract the duplicated styles into a shared utility, component, or CSS class.',
        ),
      );
    }
  }

  return issues;
}

export function runProjectRules(results: FileScanResult[], config: ResolvedConfig): Issue[] {
  return [...analyzeGapMonopoly(results, config), ...analyzeCssBloat(results, config)];
}
