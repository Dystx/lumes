import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from '../../src/config';
import {
  aggregateReport,
  contextTax,
  resolveFrameworkMultiplier,
  scoreFile,
  sizeNormalization,
  SEVERITY_WEIGHTS,
} from '../../src/engine/metrics';
import type { BaselineCache, FileScanResult, Issue, ResolvedConfig } from '../../src/types';

const baselineCache = (
  scores: Record<string, { baselineScore: number; componentCount?: number }>,
): BaselineCache => ({
  version: '1.0.0',
  config_hash: 'hash',
  git_head: 'head',
  baseline_created: new Date().toISOString(),
  baseline_revision: 1,
  totalComponentCount: Object.keys(scores).length,
  scores: Object.fromEntries(
    Object.entries(scores).map(([path, entry]) => [
      path,
      { componentCount: 1, ...entry },
    ]),
  ),
});

const issue = (severity: Issue['severity'], category: Issue['category']): Issue => ({
  ruleId: 'test/rule',
  category,
  severity,
  aiSpecific: true,
  message: 'test issue',
  line: 1,
  column: 1,
});

const fileResult = (overrides: Partial<FileScanResult> = {}): FileScanResult => ({
  filePath: 'Button.tsx',
  componentCount: 1,
  astNodeCount: 50,
  issues: [],
  ...overrides,
});

describe('contextTax', () => {
  it('equals 1 for small ASTs', () => {
    expect(contextTax(10, false, DEFAULT_CONFIG.contextTaxCaps)).toBe(1);
  });

  it('applies clean cap when no high-severity issues', () => {
    const tax = contextTax(2500, false, DEFAULT_CONFIG.contextTaxCaps);
    expect(tax).toBe(DEFAULT_CONFIG.contextTaxCaps.cleanCap);
  });

  it('applies standard cap when high-severity issues exist', () => {
    const tax = contextTax(3000, true, DEFAULT_CONFIG.contextTaxCaps);
    expect(tax).toBe(DEFAULT_CONFIG.contextTaxCaps.standardCap);
  });

  it('caps at clean cap even when tax would exceed it', () => {
    expect(contextTax(10000, false, DEFAULT_CONFIG.contextTaxCaps)).toBe(
      DEFAULT_CONFIG.contextTaxCaps.cleanCap,
    );
  });
});

describe('sizeNormalization', () => {
  it('returns 0 for an empty repo', () => {
    expect(sizeNormalization(0)).toBe(0);
  });

  it('returns 1.0 for micro-repos up to 10 components', () => {
    expect(sizeNormalization(1)).toBe(1.0);
    expect(sizeNormalization(10)).toBe(1.0);
  });

  it('scales smoothly for larger repos', () => {
    expect(sizeNormalization(100)).toBeGreaterThan(0);
    expect(sizeNormalization(100)).toBeLessThan(1);
    expect(sizeNormalization(10000)).toBe(1);
  });
});

describe('scoreFile', () => {
  it('scores zero for a clean file', () => {
    const result = scoreFile(fileResult(), 1.0, DEFAULT_CONFIG);
    expect(result.rawScore).toBe(0);
    expect(result.componentScore).toBe(0);
    expect(result.adjustedScore).toBe(0);
  });

  it('weights high-severity issues', () => {
    const result = scoreFile(
      fileResult({ issues: [issue('high', 'logic')] }),
      1.0,
      DEFAULT_CONFIG,
    );
    expect(result.rawScore).toBe(SEVERITY_WEIGHTS.high);
    expect(result.componentScore).toBeGreaterThan(0);
  });

  it('applies framework multiplier', () => {
    const base = scoreFile(
      fileResult({ issues: [issue('medium', 'visual')] }),
      1.0,
      DEFAULT_CONFIG,
    );
    const doubled = scoreFile(
      fileResult({ issues: [issue('medium', 'visual')] }),
      2.0,
      DEFAULT_CONFIG,
    );
    expect(doubled.componentScore).toBeCloseTo(base.componentScore * 2, 5);
  });

  it('caps component score at 100', () => {
    const issues: Issue[] = Array.from({ length: 50 }, () => issue('high', 'logic'));
    const result = scoreFile(fileResult({ issues }), 2.0, DEFAULT_CONFIG);
    expect(result.componentScore).toBe(100);
  });

  it('subtracts baseline score when active', () => {
    const result = scoreFile(
      fileResult({ filePath: 'Button.tsx', issues: [issue('medium', 'visual')] }),
      1.0,
      DEFAULT_CONFIG,
      baselineCache({ 'Button.tsx': { baselineScore: 2 } }),
    );
    expect(result.adjustedScore).toBe(Math.max(0, result.componentScore - 2));
  });

  it('floors adjusted score at zero', () => {
    const result = scoreFile(
      fileResult({ filePath: 'Button.tsx', issues: [issue('low', 'visual')] }),
      1.0,
      DEFAULT_CONFIG,
      baselineCache({ 'Button.tsx': { baselineScore: 10 } }),
    );
    expect(result.adjustedScore).toBe(0);
  });

  it('looks up baseline by relative path when given an absolute file path', () => {
    const cwd = process.cwd();
    const result = scoreFile(
      fileResult({ filePath: `${cwd}/Button.tsx`, issues: [issue('medium', 'visual')] }),
      1.0,
      DEFAULT_CONFIG,
      baselineCache({ 'Button.tsx': { baselineScore: 2 } }),
      cwd,
    );
    expect(result.adjustedScore).toBe(Math.max(0, result.componentScore - 2));
  });

  it('applies category weights', () => {
    const config: ResolvedConfig = {
      ...DEFAULT_CONFIG,
      categoryWeights: { ...DEFAULT_CONFIG.categoryWeights!, visual: 3.0, logic: 1.0 },
    };
    const visual = scoreFile(fileResult({ issues: [issue('low', 'visual')] }), 1.0, config);
    const logic = scoreFile(fileResult({ issues: [issue('low', 'logic')] }), 1.0, config);
    expect(visual.rawScore).toBeGreaterThan(logic.rawScore);
  });

  it('applies a density multiplier for repeated rule instances', () => {
    const issues: Issue[] = Array.from({ length: 10 }, () => issue('low', 'visual'));
    const single = scoreFile(fileResult({ issues: [issue('low', 'visual')] }), 1.0, DEFAULT_CONFIG);
    const repeated = scoreFile(fileResult({ issues }), 1.0, DEFAULT_CONFIG);
    expect(repeated.rawScore).toBeGreaterThan(single.rawScore * 10);
  });
});

describe('aggregateReport', () => {
  it('aggregates mean, peak, slopIndex and assemblyHealth using mean/p90 blend', () => {
    const scores = [
      scoreFile(fileResult({ filePath: 'A.tsx', issues: [issue('high', 'logic')] }), 1.0, DEFAULT_CONFIG),
      scoreFile(fileResult({ filePath: 'B.tsx', issues: [issue('low', 'visual')] }), 1.0, DEFAULT_CONFIG),
    ];
    const issueGroups = scores.map((s) => ({
      filePath: s.filePath,
      issues: s.filePath === 'A.tsx' ? [issue('high', 'logic')] : [issue('low', 'visual')],
    }));

    const report = aggregateReport(scores, issueGroups, DEFAULT_CONFIG);
    const expectedMean =
      (scores[0].adjustedScore + scores[1].adjustedScore) / scores.length;
    const expectedP90 = Math.max(scores[0].adjustedScore, scores[1].adjustedScore);
    const expectedBlend = (expectedMean + 0.5 * expectedP90) / 1.5;

    expect(report.componentCount).toBe(2);
    expect(report.slopIndex).toBeCloseTo(expectedBlend * sizeNormalization(2), 5);
    expect(report.assemblyHealth).toBeCloseTo(100 - report.slopIndex, 5);
    expect(report.peakScore).toBe(Math.max(scores[0].adjustedScore, scores[1].adjustedScore));
    expect(report.p90Score).toBeGreaterThanOrEqual(
      Math.min(scores[0].adjustedScore, scores[1].adjustedScore),
    );
    expect(report.p90Score).toBeLessThanOrEqual(report.peakScore);
  });

  it('computes category scores from adjusted score contributions normalized by component count', () => {
    const aIssues = [issue('high', 'logic'), issue('medium', 'wcag')];
    const scores = [
      scoreFile(
        fileResult({ filePath: 'A.tsx', issues: aIssues }),
        1.0,
        DEFAULT_CONFIG,
      ),
      scoreFile(fileResult({ filePath: 'B.tsx' }), 1.0, DEFAULT_CONFIG),
    ];
    const issueGroups = [
      {
        filePath: 'A.tsx',
        issues: aIssues,
      },
      { filePath: 'B.tsx', issues: [] },
    ];

    const report = aggregateReport(scores, issueGroups, DEFAULT_CONFIG);
    const totalComponents = scores.reduce((sum, s) => sum + s.componentCount, 0);
    const aRaw = aIssues.reduce((sum, i) => sum + SEVERITY_WEIGHTS[i.severity], 0);
    const logicShare = (scores[0].adjustedScore * SEVERITY_WEIGHTS.high) / aRaw;
    const wcagShare = (scores[0].adjustedScore * SEVERITY_WEIGHTS.medium) / aRaw;

    expect(report.categoryScores.logic).toBeCloseTo(logicShare / totalComponents, 5);
    expect(report.categoryScores.wcag).toBeCloseTo(wcagShare / totalComponents, 5);
    expect(report.categoryScores.visual).toBe(0);
  });

  it('weights category scores by categoryWeights', () => {
    const issues: Issue[] = [
      { ruleId: 'visual-rule', category: 'visual', severity: 'low', aiSpecific: true, message: 'v', line: 1, column: 1 },
      { ruleId: 'logic-rule', category: 'logic', severity: 'low', aiSpecific: true, message: 'l', line: 1, column: 1 },
    ];
    const config: ResolvedConfig = {
      ...DEFAULT_CONFIG,
      categoryWeights: { ...DEFAULT_CONFIG.categoryWeights!, visual: 2, logic: 1 },
    };
    const scores = [scoreFile(fileResult({ issues }), 1.0, config)];
    const report = aggregateReport(scores, [{ filePath: 'Button.tsx', issues }], config);
    expect(report.categoryScores.visual).toBeGreaterThan(report.categoryScores.logic);
  });

  it('weights category scores by rule density', () => {
    const repeated: Issue[] = Array.from({ length: 10 }, () => ({
      ruleId: 'dense',
      category: 'visual',
      severity: 'low',
      aiSpecific: true,
      message: 'd',
      line: 1,
      column: 1,
    }));
    const single: Issue[] = [
      { ruleId: 'sparse', category: 'logic', severity: 'low', aiSpecific: true, message: 's', line: 1, column: 1 },
    ];
    const issues = [...repeated, ...single];
    const config: ResolvedConfig = {
      ...DEFAULT_CONFIG,
      categoryWeights: { ...DEFAULT_CONFIG.categoryWeights!, visual: 1, logic: 1 },
    };
    const scores = [scoreFile(fileResult({ issues }), 1.0, config)];
    const report = aggregateReport(scores, [{ filePath: 'Button.tsx', issues }], config);
    expect(report.categoryScores.visual).toBeGreaterThan(report.categoryScores.logic * 10);
  });

  it('handles empty scores gracefully', () => {
    const report = aggregateReport([], [], DEFAULT_CONFIG);
    expect(report.slopIndex).toBe(0);
    expect(report.assemblyHealth).toBe(100);
    expect(report.peakScore).toBe(0);
    expect(report.p90Score).toBe(0);
    expect(report.componentCount).toBe(0);
  });
});

describe('resolveFrameworkMultiplier', () => {
  it('returns the configured multiplier for the active framework', () => {
    const config = { ...DEFAULT_CONFIG, framework: 'vue', frameworkMultipliers: { ...DEFAULT_CONFIG.frameworkMultipliers, vue: 1.5 } };
    expect(resolveFrameworkMultiplier(config)).toBe(1.5);
  });

  it('defaults to react when no framework is configured', () => {
    const config = { ...DEFAULT_CONFIG, framework: undefined };
    expect(resolveFrameworkMultiplier(config)).toBe(DEFAULT_CONFIG.frameworkMultipliers.react);
  });

  it('falls back to 1.0 for unknown frameworks', () => {
    const config = { ...DEFAULT_CONFIG, framework: 'unknown' };
    expect(resolveFrameworkMultiplier(config)).toBe(1.0);
  });
});
