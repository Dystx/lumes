import { describe, expect, it } from 'vitest';
import { RuleRegistry } from '../../src/rules/registry';
import { createRule } from '../../src/rules/rule';
import type { Issue, ResolvedConfig, Rule, ScanFacts } from '../../src/types';

function makeConfig(): ResolvedConfig {
  return {
    include: [],
    exclude: [],
    rules: {},
    frameworkMultipliers: {},
    ruleConfig: {},
    contextTaxCaps: { cleanCap: 0, standardCap: 0 },
    arbitraryValueAllowlist: [],
    wcag: { targetSizeExemptSelectors: [] },
    thresholds: {
      meanSlop: 0,
      p90Slop: 0,
      individualSlopThreshold: 0,
    },
  };
}

describe('RuleRegistry', () => {
  it('registers and retrieves rules', () => {
    const registry = new RuleRegistry();
    const rule = createRule({
      id: 'test/rule',
      category: 'logic',
      severity: 'medium',
      aiSpecific: true,
      create: () => ({}),
      analyze: (): Issue[] => [],
    });
    registry.register(rule);
    expect(registry.getRules().length).toBe(1);
  });

  it('filters by ai and human kind', () => {
    const registry = new RuleRegistry();
    registry.register(
      createRule({ id: 'a', category: 'logic', severity: 'low', aiSpecific: true, create: () => ({}), analyze: () => [] })
    );
    registry.register(
      createRule({ id: 'b', category: 'logic', severity: 'low', aiSpecific: false, create: () => ({}), analyze: () => [] })
    );
    expect(registry.getRules({ kind: 'ai' }).length).toBe(1);
    expect(registry.getRules({ kind: 'human' }).length).toBe(1);
  });

  it('creates rule contexts', () => {
    const registry = new RuleRegistry();
    const rule = createRule({
      id: 'test/rule',
      category: 'logic',
      severity: 'medium',
      aiSpecific: true,
      create: (ctx) => ({ filePath: ctx.filePath }),
      analyze: (): Issue[] => [],
    });
    registry.register(rule);
    const enabled = registry.createContexts(makeConfig(), 'Button.tsx');
    expect(enabled).toHaveLength(1);
    expect(enabled[0].context).toEqual({ filePath: 'Button.tsx' });
  });

  it('loads all seven P0 built-in rules', () => {
    const registry = new RuleRegistry();
    registry.loadBuiltins();
    const rules = registry.getRules();
    expect(rules).toHaveLength(7);
    expect(rules.map((r) => r.id).sort()).toEqual([
      'logic/boundary-violation',
      'logic/ghost-defensive',
      'logic/zombie-state',
      'visual/arbitrary-escape',
      'visual/generic-centering',
      'wcag/focus-appearance',
      'wcag/target-size',
    ]);
  });
});
