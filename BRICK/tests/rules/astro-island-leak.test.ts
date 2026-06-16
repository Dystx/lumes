import { describe, it, expect } from 'vitest';
import { astroIslandLeakRule } from '../../src/rules/arch/astro-island-leak';
import type { ResolvedConfig, ScanFacts } from '../../src/types';

function makeFacts(astroComponents: ScanFacts['astroComponents']): ScanFacts {
  return {
    filePath: '/x.astro',
    astNodeCount: 10,
    components: [],
    staticClassNames: [],
    interactiveElements: [],
    allElements: [],
    imageElements: [],
    imports: [],
    hooks: [],
    logicalExpressions: [],
    styleProps: [],
    astroComponents,
  };
}

const baseConfig: ResolvedConfig = {
  include: [],
  exclude: [],
  rules: { 'arch/astro-island-leak': 'low' },
  frameworkMultipliers: {},
  ruleConfig: {},
  contextTaxCaps: { cleanCap: 1.5, standardCap: 2.0 },
  thresholds: { meanSlop: 25, p90Slop: 50, individualSlopThreshold: 50 },
  arbitraryValueAllowlist: [],
  wcag: { targetSizeExemptSelectors: [] },
};

describe('arch/astro-island-leak', () => {
  it('flags event handlers without a client directive', () => {
    const context = astroIslandLeakRule.create({ config: baseConfig, filePath: '/x.astro', cwd: '/' });
    const facts = makeFacts([{ tag: 'Counter', hasClientDirective: false, hasEventHandler: true, line: 3, column: 1 }]);
    const issues = astroIslandLeakRule.analyze(context, facts);
    expect(issues).toHaveLength(1);
    expect(issues[0].ruleId).toBe('arch/astro-island-leak');
    expect(issues[0].message).toContain('Counter');
  });

  it('ignores components with a client directive', () => {
    const context = astroIslandLeakRule.create({ config: baseConfig, filePath: '/x.astro', cwd: '/' });
    const facts = makeFacts([{ tag: 'Counter', hasClientDirective: true, hasEventHandler: true, line: 3, column: 1 }]);
    expect(astroIslandLeakRule.analyze(context, facts)).toHaveLength(0);
  });

  it('ignores components without event handlers', () => {
    const context = astroIslandLeakRule.create({ config: baseConfig, filePath: '/x.astro', cwd: '/' });
    const facts = makeFacts([{ tag: 'Icon', hasClientDirective: false, hasEventHandler: false, line: 3, column: 1 }]);
    expect(astroIslandLeakRule.analyze(context, facts)).toHaveLength(0);
  });

  it('is disabled when rule severity is off', () => {
    const config: ResolvedConfig = { ...baseConfig, rules: { 'arch/astro-island-leak': 'off' } };
    const context = astroIslandLeakRule.create({ config, filePath: '/x.astro', cwd: '/' });
    const facts = makeFacts([{ tag: 'Counter', hasClientDirective: false, hasEventHandler: true, line: 3, column: 1 }]);
    expect(astroIslandLeakRule.analyze(context, facts)).toHaveLength(0);
  });
});
