import { describe, it, expect } from 'vitest';
import { clampOffscaleRule } from '../../src/rules/typo/clamp-offscale';
import type { ResolvedConfig, ScanFacts } from '../../src/types';

function makeFacts(staticClassNames: ScanFacts['staticClassNames'] = [], styleProps: ScanFacts['styleProps'] = []): ScanFacts {
  return {
    filePath: '/x.tsx',
    astNodeCount: 10,
    components: [],
    staticClassNames,
    interactiveElements: [],
    allElements: [],
    imageElements: [],
    imports: [],
    hooks: [],
    logicalExpressions: [],
    styleProps,
    astroComponents: [],
  };
}

const baseConfig: ResolvedConfig = {
  include: [],
  exclude: [],
  rules: { 'typo/clamp-offscale': 'medium' },
  frameworkMultipliers: {},
  ruleConfig: {},
  contextTaxCaps: { cleanCap: 1.5, standardCap: 2.0 },
  thresholds: { meanSlop: 25, p90Slop: 50, individualSlopThreshold: 50 },
  arbitraryValueAllowlist: [],
  wcag: { targetSizeExemptSelectors: [] },
};

describe('typo/clamp-offscale', () => {
  it('flags font-size clamp values off the typography scale', () => {
    const context = clampOffscaleRule.create({ config: baseConfig, filePath: '/x.tsx', cwd: '/' });
    const facts = makeFacts([], [{ source: "{ fontSize: 'clamp(0.5rem, 10vw, 10rem)' }", line: 2, column: 3 }]);
    const issues = clampOffscaleRule.analyze(context, facts);
    expect(issues).toHaveLength(1);
    expect(issues[0].ruleId).toBe('typo/clamp-offscale');
  });

  it('ignores clamp values within 20% of the scale', () => {
    const context = clampOffscaleRule.create({ config: baseConfig, filePath: '/x.tsx', cwd: '/' });
    const facts = makeFacts([], [{ source: "{ fontSize: 'clamp(1rem, 2vw, 1.5rem)' }", line: 2, column: 3 }]);
    expect(clampOffscaleRule.analyze(context, facts)).toHaveLength(0);
  });

  it('flags arbitrary text-[clamp(...)] classes', () => {
    const context = clampOffscaleRule.create({ config: baseConfig, filePath: '/x.tsx', cwd: '/' });
    const facts = makeFacts([{ value: 'text-[clamp(0.4rem,2vw,8rem)]', line: 2, column: 3 }]);
    const issues = clampOffscaleRule.analyze(context, facts);
    expect(issues).toHaveLength(1);
    expect(issues[0].message).toContain('clamp');
  });

  it('ignores non-typography clamp classes', () => {
    const context = clampOffscaleRule.create({ config: baseConfig, filePath: '/x.tsx', cwd: '/' });
    const facts = makeFacts([{ value: 'w-[clamp(1rem,2vw,3rem)]', line: 2, column: 3 }]);
    expect(clampOffscaleRule.analyze(context, facts)).toHaveLength(0);
  });
});
