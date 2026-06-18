import { describe, expect, it } from 'vitest';
import { writeFileSync, mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { parseFile } from '../../src/engine/parser';
import { extractFacts } from '../../src/engine/visitor';
import { inlineStyleRule } from '../../src/rules/visual/inline-style';
import type { ResolvedConfig, RuleContext } from '../../src/types';

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

async function runRule(
  source: string,
  config: ResolvedConfig,
  fileName = 'Component.tsx',
): Promise<ReturnType<typeof inlineStyleRule.analyze>> {
  const dir = mkdtempSync(join(tmpdir(), 'slop-audit-inline-style-test-'));
  try {
    const filePath = join(dir, fileName);
    writeFileSync(filePath, source);
    const { ast, nodeCount } = await parseFile(filePath);
    const facts = extractFacts(filePath, ast, nodeCount);
    const context: RuleContext = { config, filePath, cwd: dir };
    const ruleContext = inlineStyleRule.create(context);
    return inlineStyleRule.analyze(ruleContext, facts);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('inline-style', () => {
  it('flags a single inline style prop with a concrete severity override', async () => {
    const source = `
export function Box() {
  return <div style={{ color: 'red' }}>Hello</div>;
}
`;
    const issues = await runRule(
      source,
      makeConfig({ rules: { 'visual/inline-style': 'medium' } }),
    );
    expect(issues).toHaveLength(1);
    expect(issues[0].ruleId).toBe('visual/inline-style');
    expect(issues[0].severity).toBe('medium');
    expect(issues[0].message).toBe('Inline style prop detected');
    expect(issues[0].advice).toBe('Move the style to a class or design-system token.');
  });

  it('flags multiple inline style props in one file', async () => {
    const source = `
export function Box() {
  return (
    <>
      <div style={{ color: 'red' }}>A</div>
      <span style={{ fontSize: 14 }}>B</span>
    </>
  );
}
`;
    const issues = await runRule(source, makeConfig());
    expect(issues).toHaveLength(2);
    expect(issues[0].ruleId).toBe('visual/inline-style');
    expect(issues[1].ruleId).toBe('visual/inline-style');
    expect(issues.every((i) => i.severity === 'medium')).toBe(true);
  });

  it('uses low severity for a single inline style when configured as auto', async () => {
    const source = `
export function Box() {
  return <div style={{ color: 'red' }}>Hello</div>;
}
`;
    const issues = await runRule(
      source,
      makeConfig({ rules: { 'visual/inline-style': 'auto' } }),
    );
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe('low');
  });

  it('uses high severity for six or more inline styles when configured as auto', async () => {
    const source = `
export function Box() {
  return (
    <>
      <div style={{ color: 'red' }}>1</div>
      <div style={{ color: 'blue' }}>2</div>
      <div style={{ color: 'green' }}>3</div>
      <div style={{ color: 'yellow' }}>4</div>
      <div style={{ color: 'purple' }}>5</div>
      <div style={{ color: 'orange' }}>6</div>
    </>
  );
}
`;
    const issues = await runRule(
      source,
      makeConfig({ rules: { 'visual/inline-style': 'auto' } }),
    );
    expect(issues).toHaveLength(6);
    expect(issues.every((i) => i.severity === 'high')).toBe(true);
  });

  it('ignores elements without a style prop', async () => {
    const source = `
export function Box() {
  return <div className="text-red-500">Hello</div>;
}
`;
    const issues = await runRule(source, makeConfig());
    expect(issues).toHaveLength(0);
  });

  it('returns no issues when the rule is off', async () => {
    const source = `
export function Box() {
  return <div style={{ color: 'red' }}>Hello</div>;
}
`;
    const issues = await runRule(
      source,
      makeConfig({ rules: { 'visual/inline-style': 'off' } }),
    );
    expect(issues).toHaveLength(0);
  });
});
