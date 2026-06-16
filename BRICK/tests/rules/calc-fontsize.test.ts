import { describe, expect, it } from 'vitest';
import { writeFileSync, mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { parseFile } from '../../src/engine/parser';
import { extractFacts } from '../../src/engine/visitor';
import { calcFontSizeRule } from '../../src/rules/typo/calc-fontsize';
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

async function runRule(
  source: string,
  config: ResolvedConfig,
  fileName = 'Component.tsx',
): Promise<Issue[]> {
  const dir = mkdtempSync(join(tmpdir(), 'slop-audit-calc-fontsize-test-'));
  try {
    const filePath = join(dir, fileName);
    writeFileSync(filePath, source);
    const { ast, nodeCount } = await parseFile(filePath);
    const facts = extractFacts(filePath, ast, nodeCount);
    const context: RuleContext = { config, filePath, cwd: dir };
    const ruleContext = calcFontSizeRule.create(context);
    return calcFontSizeRule.analyze(ruleContext, facts);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('typo/calc-fontsize', () => {
  it('flags fontSize set to calc()', async () => {
    const source = `export function Card() { return <div style={{ fontSize: 'calc(1rem + 1vw)' }} />; }`;
    const issues = await runRule(source, makeConfig());

    expect(issues).toHaveLength(1);
    expect(issues[0].ruleId).toBe('typo/calc-fontsize');
    expect(issues[0].category).toBe('typo');
    expect(issues[0].severity).toBe('medium');
    expect(issues[0].aiSpecific).toBe(false);
    expect(issues[0].message).toBe(
      'font-size uses calc() without an explicit design token baseline',
    );
    expect(issues[0].advice).toBe(
      'Use a typography token or a named clamp() instead of calc() for font sizes.',
    );
  });

  it("flags quoted 'font-size' set to calc()", async () => {
    const source = `export function Card() { return <div style={{ 'font-size': 'calc(0.875rem + 0.25vw)' }} />; }`;
    const issues = await runRule(source, makeConfig());

    expect(issues).toHaveLength(1);
    expect(issues[0].ruleId).toBe('typo/calc-fontsize');
  });

  it('flags double-quoted "font-size" set to calc()', async () => {
    const source = `export function Card() { return <div style={{ "font-size": "calc(0.875rem + 0.25vw)" }} />; }`;
    const issues = await runRule(source, makeConfig());

    expect(issues).toHaveLength(1);
    expect(issues[0].ruleId).toBe('typo/calc-fontsize');
  });

  it('does not flag fontSize with a design token string', async () => {
    const source = `export function Card() { return <div style={{ fontSize: 'var(--font-size-base)' }} />; }`;
    const issues = await runRule(source, makeConfig());

    expect(issues).toHaveLength(0);
  });

  it('does not flag calc() used in non-font-size properties', async () => {
    const source = `export function Card() { return <div style={{ width: 'calc(100% - 2rem)', fontSize: '1rem' }} />; }`;
    const issues = await runRule(source, makeConfig());

    expect(issues).toHaveLength(0);
  });

  it('does not flag when no calc() is present', async () => {
    const source = `export function Card() { return <div style={{ fontSize: '1.25rem' }} />; }`;
    const issues = await runRule(source, makeConfig());

    expect(issues).toHaveLength(0);
  });
});
