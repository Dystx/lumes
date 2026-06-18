import { describe, it, expect } from 'vitest';
import { reactiveHookSoupRule } from '../../src/rules/logic/reactive-hook-soup';
import type { ResolvedConfig, ScanFacts } from '../../src/types';

function makeFacts(components: ScanFacts['components']): ScanFacts {
  return {
    filePath: '/x.tsx',
    astNodeCount: 10,
    components,
    staticClassNames: [],
    interactiveElements: [],
    allElements: [],
    imageElements: [],
    imports: [],
    hooks: [],
    logicalExpressions: [],
    styleProps: [],
    astroComponents: [],
    consoleCalls: [],
    stringLiterals: [],
  };
}

const baseConfig: ResolvedConfig = {
  include: [],
  exclude: [],
  rules: { 'logic/reactive-hook-soup': 'medium' },
  frameworkMultipliers: {},
  ruleConfig: {},
  contextTaxCaps: { cleanCap: 1.5, standardCap: 2.0 },
  thresholds: { meanSlop: 25, p90Slop: 50, individualSlopThreshold: 50 },
  arbitraryValueAllowlist: [],
  wcag: { targetSizeExemptSelectors: [] },
};

describe('logic/reactive-hook-soup', () => {
  it('flags components with three or more useEffect calls', () => {
    const context = reactiveHookSoupRule.create({ config: baseConfig, filePath: '/x.tsx', cwd: '/' });
    const facts = makeFacts([
      {
        name: 'Soup',
        line: 1,
        column: 1,
        isServerComponent: false,
        hookCalls: [
          { name: 'useEffect', line: 2, column: 3 },
          { name: 'useEffect', line: 5, column: 3 },
          { name: 'useEffect', line: 8, column: 3 },
        ],
        stateBindings: [],
      },
    ]);
    const issues = reactiveHookSoupRule.analyze(context, facts);
    expect(issues).toHaveLength(1);
    expect(issues[0].ruleId).toBe('logic/reactive-hook-soup');
    expect(issues[0].message).toContain('Soup');
  });

  it('ignores components with fewer than three useEffect calls', () => {
    const context = reactiveHookSoupRule.create({ config: baseConfig, filePath: '/x.tsx', cwd: '/' });
    const facts = makeFacts([
      {
        name: 'Clean',
        line: 1,
        column: 1,
        isServerComponent: false,
        hookCalls: [
          { name: 'useEffect', line: 2, column: 3 },
          { name: 'useState', line: 5, column: 3 },
        ],
        stateBindings: [],
      },
    ]);
    expect(reactiveHookSoupRule.analyze(context, facts)).toHaveLength(0);
  });
});
