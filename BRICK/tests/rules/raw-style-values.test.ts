import { describe, expect, it } from 'vitest';
import { writeFileSync, mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { parseFile } from '../../src/engine/parser';
import { extractFacts } from '../../src/engine/visitor';
import { rawStyleValuesRule } from '../../src/rules/visual/raw-style-values';
import type { Issue, ResolvedConfig, RuleContext } from '../../src/types';

function makeConfig(overrides?: Partial<ResolvedConfig>): ResolvedConfig {
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
    ...overrides,
  };
}

async function runRule(source: string, config: ResolvedConfig): Promise<Issue[]> {
  const dir = mkdtempSync(join(tmpdir(), 'slop-audit-raw-style-values-test-'));
  try {
    const filePath = join(dir, 'Component.tsx');
    writeFileSync(filePath, source);
    const { ast, nodeCount } = await parseFile(filePath);
    const facts = extractFacts(filePath, ast, nodeCount);
    const context: RuleContext = { config, filePath, cwd: dir };
    const ruleContext = rawStyleValuesRule.create(context);
    return rawStyleValuesRule.analyze(ruleContext, facts);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('visual/raw-style-values', () => {
  it('flags raw numeric values when theme tokens are imported', async () => {
    const source = `
import { spacing } from '@/theme/tokens';
export function Box() {
  return <View style={{ marginTop: 24 }} />;
}
`;
    const issues = await runRule(source, makeConfig());
    expect(issues).toHaveLength(1);
    expect(issues[0].message).toContain('raw numeric value');
  });

  it('flags raw hex colors when theme tokens are imported', async () => {
    const source = `
import { colors } from '@/theme/tokens';
export function Box() {
  return <View style={{ backgroundColor: '#ffffff' }} />;
}
`;
    const issues = await runRule(source, makeConfig());
    expect(issues).toHaveLength(1);
    expect(issues[0].message).toContain('raw color');
  });

  it('does not flag when no theme import exists', async () => {
    const source = `
export function Box() {
  return <View style={{ marginTop: 24 }} />;
}
`;
    const issues = await runRule(source, makeConfig());
    expect(issues).toHaveLength(0);
  });

  it('does not flag token values', async () => {
    const source = `
import { spacing } from '@/theme/tokens';
export function Box() {
  return <View style={{ marginTop: spacing.md }} />;
}
`;
    const issues = await runRule(source, makeConfig());
    expect(issues).toHaveLength(0);
  });
});
