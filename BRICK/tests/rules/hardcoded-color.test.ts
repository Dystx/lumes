import { describe, expect, it } from 'vitest';
import { writeFileSync, mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { parseFile } from '../../src/engine/parser';
import { extractFacts } from '../../src/engine/visitor';
import { hardcodedColorRule } from '../../src/rules/visual/hardcoded-color';
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
  const dir = mkdtempSync(join(tmpdir(), 'slop-audit-hardcoded-color-test-'));
  try {
    const filePath = join(dir, 'Component.tsx');
    writeFileSync(filePath, source);
    const { ast, nodeCount } = await parseFile(filePath);
    const facts = extractFacts(filePath, ast, nodeCount);
    const context: RuleContext = { config, filePath, cwd: dir };
    const ruleContext = hardcodedColorRule.create(context);
    return hardcodedColorRule.analyze(ruleContext, facts);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('visual/hardcoded-color', () => {
  it('flags a hex color literal in a style prop', async () => {
    const source = `
export function Box() {
  return <View style={{ backgroundColor: '#ff0000' }} />;
}
`;
    const issues = await runRule(source, makeConfig());
    expect(issues).toHaveLength(1);
    expect(issues[0].ruleId).toBe('visual/hardcoded-color');
    expect(issues[0].message).toBe('Hardcoded color literal in style prop');
    expect(issues[0].advice).toBe('Use a design-system color token instead.');
  });

  it('flags an rgb color literal in a style prop', async () => {
    const source = `
export function Box() {
  return <View style={{ color: 'rgb(255, 0, 0)' }} />;
}
`;
    const issues = await runRule(source, makeConfig());
    expect(issues).toHaveLength(1);
    expect(issues[0].message).toBe('Hardcoded color literal in style prop');
  });

  it('flags rgba and hsl color literals', async () => {
    const source = `
export function Box() {
  return (
    <>
      <View style={{ color: 'rgba(255, 0, 0, 0.5)' }} />
      <View style={{ backgroundColor: 'hsl(0, 100%, 50%)' }} />
    </>
  );
}
`;
    const issues = await runRule(source, makeConfig());
    expect(issues).toHaveLength(2);
    expect(issues.every((i) => i.ruleId === 'visual/hardcoded-color')).toBe(true);
  });

  it('flags uppercase color functions', async () => {
    const source = `
export function Box() {
  return <View style={{ color: 'RGB(255, 0, 0)' }} />;
}
`;
    const issues = await runRule(source, makeConfig());
    expect(issues).toHaveLength(1);
  });

  it('does not flag invalid-length hex values', async () => {
    const source = `
export function Box() {
  return <View style={{ color: '#ff00f' }} />;
}
`;
    const issues = await runRule(source, makeConfig());
    expect(issues).toHaveLength(0);
  });

  it('does not flag a CSS variable color value', async () => {
    const source = `
export function Box() {
  return <View style={{ backgroundColor: 'var(--primary)' }} />;
}
`;
    const issues = await runRule(source, makeConfig());
    expect(issues).toHaveLength(0);
  });

  it('does not flag a non-color style prop', async () => {
    const source = `
export function Box() {
  return <View style={{ display: 'flex' }} />;
}
`;
    const issues = await runRule(source, makeConfig());
    expect(issues).toHaveLength(0);
  });
});
