import { describe, it, expect } from 'vitest';
import { analyzeGapMonopoly, analyzeCssBloat, runProjectRules } from '../../src/rules/project';
import type { FileScanResult, ResolvedConfig } from '../../src/types';

function makeResult(filePath: string, gapValues: string[] = [], styleSources: string[] = []): FileScanResult {
  return {
    filePath,
    componentCount: 1,
    astNodeCount: 10,
    issues: [],
    gapValues,
    styleSources,
  };
}

const baseConfig: ResolvedConfig = {
  include: [],
  exclude: [],
  rules: {
    'layout/gap-monopoly': 'medium',
    'perf/css-bloat': 'low',
  },
  frameworkMultipliers: {},
  ruleConfig: {},
  contextTaxCaps: { cleanCap: 1.5, standardCap: 2.0 },
  thresholds: { meanSlop: 25, p90Slop: 50, individualSlopThreshold: 50 },
  arbitraryValueAllowlist: [],
  wcag: { targetSizeExemptSelectors: [] },
};

describe('layout/gap-monopoly', () => {
  it('does not trigger when gap values are varied', () => {
    const results = [
      makeResult('/a.tsx', ['gap-4', 'gap-8']),
      makeResult('/b.tsx', ['gap-4', 'gap-6']),
    ];
    const issues = analyzeGapMonopoly(results, baseConfig);
    expect(issues).toHaveLength(0);
  });

  it('triggers when a single gap value dominates', () => {
    const results = [
      makeResult('/a.tsx', ['gap-4', 'gap-4']),
      makeResult('/b.tsx', ['gap-4']),
      makeResult('/c.tsx', ['gap-4']),
    ];
    const issues = analyzeGapMonopoly(results, baseConfig);
    expect(issues).toHaveLength(1);
    expect(issues[0].ruleId).toBe('layout/gap-monopoly');
    expect(issues[0].message).toContain('gap-4');
    expect(issues[0].message).toContain('100%');
  });

  it('respects configured gapTokens and raises tolerance', () => {
    const results = [
      ...Array.from({ length: 9 }, (_, i) => makeResult(`/a${i}.tsx`, ['gap-4'])),
      makeResult('/b.tsx', ['gap-8']),
    ];
    const config: ResolvedConfig = { ...baseConfig, gapTokens: ['gap-4'] };
    const issues = analyzeGapMonopoly(results, config);
    expect(issues).toHaveLength(0);
  });

  it('is disabled when rule is off', () => {
    const results = [makeResult('/a.tsx', ['gap-4'])];
    const config: ResolvedConfig = { ...baseConfig, rules: { ...baseConfig.rules, 'layout/gap-monopoly': 'off' } };
    expect(analyzeGapMonopoly(results, config)).toHaveLength(0);
  });
});

describe('perf/css-bloat', () => {
  it('does not trigger for unique style strings', () => {
    const results = [
      makeResult('/a.tsx', [], ['p-4 m-2']),
      makeResult('/b.tsx', [], ['p-6 m-4']),
    ];
    expect(analyzeCssBloat(results, baseConfig)).toHaveLength(0);
  });

  it('triggers when a style string repeats across files', () => {
    const duplicated = 'flex items-center justify-center';
    const results = [
      makeResult('/a.tsx', [], [duplicated, duplicated]),
      makeResult('/b.tsx', [], [duplicated, duplicated]),
      makeResult('/c.tsx', [], [duplicated, duplicated]),
    ];
    const issues = analyzeCssBloat(results, baseConfig);
    expect(issues).toHaveLength(1);
    expect(issues[0].ruleId).toBe('perf/css-bloat');
  });

  it('ignores duplicates within a single file', () => {
    const duplicated = 'p-4';
    const results = [makeResult('/a.tsx', [], Array(10).fill(duplicated))];
    expect(analyzeCssBloat(results, baseConfig)).toHaveLength(0);
  });

  it('normalizes whitespace before comparing', () => {
    const results = [
      makeResult('/a.tsx', [], ['flex  items-center']),
      makeResult('/b.tsx', [], ['flex items-center']),
      makeResult('/c.tsx', [], ['flex items-center']),
      makeResult('/d.tsx', [], ['flex items-center']),
      makeResult('/e.tsx', [], ['flex items-center']),
      makeResult('/f.tsx', [], ['flex items-center']),
    ];
    const issues = analyzeCssBloat(results, baseConfig);
    expect(issues).toHaveLength(1);
  });
});

describe('runProjectRules', () => {
  it('returns issues from all enabled project rules', () => {
    const duplicated = 'centered';
    const results = [
      makeResult('/a.tsx', ['gap-4', 'gap-4'], [duplicated]),
      makeResult('/b.tsx', ['gap-4'], [duplicated]),
      makeResult('/c.tsx', ['gap-4'], [duplicated]),
      makeResult('/d.tsx', ['gap-4'], [duplicated]),
      makeResult('/e.tsx', ['gap-4'], [duplicated]),
      makeResult('/f.tsx', ['gap-4'], [duplicated]),
    ];
    const issues = runProjectRules(results, baseConfig);
    expect(issues.length).toBeGreaterThanOrEqual(2);
  });
});
