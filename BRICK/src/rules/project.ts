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

  const counts = new Map<string, number>();
  let total = 0;
  for (const result of results) {
    for (const value of result.gapValues ?? []) {
      counts.set(value, (counts.get(value) ?? 0) + 1);
      total++;
    }
  }

  if (total === 0) return [];

  const gapTokens = config.gapTokens;
  const hasExplicitTokens =
    Array.isArray(gapTokens) && gapTokens.length >= 1 && gapTokens.length <= 3;
  const tolerance = hasExplicitTokens ? 0.95 : 0.8;

  const issues: Issue[] = [];
  for (const [value, count] of counts) {
    const ratio = count / total;
    if (ratio >= tolerance) {
      const percentage = Math.round(ratio * 100);
      issues.push(
        createProjectIssue(
          id,
          'layout',
          config.rules[id] as Issue['severity'],
          true,
          `Gap value "${value}" dominates ${percentage}% of project gap declarations.`,
          'Introduce more spacing variety or document the intentional uniform spacing system in config.gapTokens.',
        ),
      );
    }
  }

  return issues;
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
