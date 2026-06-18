import { describe, expect, it } from 'vitest';
import { writeFileSync, mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { parseFile } from '../../src/engine/parser';
import { extractFacts } from '../../src/engine/visitor';
import { clampSoupRule } from '../../src/rules/visual/clamp-soup';
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
): Promise<ReturnType<typeof clampSoupRule.analyze>> {
  const dir = mkdtempSync(join(tmpdir(), 'slop-audit-clamp-soup-test-'));
  try {
    const filePath = join(dir, fileName);
    writeFileSync(filePath, source);
    const { ast, nodeCount } = await parseFile(filePath);
    const facts = extractFacts(filePath, ast, nodeCount);
    const context: RuleContext = { config, filePath, cwd: dir };
    const ruleContext = clampSoupRule.create(context);
    return clampSoupRule.analyze(ruleContext, facts);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('clamp-soup', () => {
  it('flags clamp() that uses raw viewport units', async () => {
    const source = `
export function Hero() {
  return <div style={{ fontSize: 'clamp(1rem, 2vw, 2rem)' }} />;
}
`;
    const issues = await runRule(source, makeConfig());
    expect(issues).toHaveLength(1);
    expect(issues[0].ruleId).toBe('visual/clamp-soup');
    expect(issues[0].category).toBe('visual');
    expect(issues[0].severity).toBe('high');
    expect(issues[0].aiSpecific).toBe(true);
    expect(issues[0].message).toBe(
      'clamp() uses raw viewport units without a design token alias',
    );
    expect(issues[0].advice).toBe(
      'Replace viewport-only clamp() with token-based fluid sizing, alias the values in your design config, or add the clamp to clampAllowlist if intentional.',
    );
  });

  it('flags multiple raw viewport clamps separately', async () => {
    const source = `
export function Hero() {
  return (
    <div
      style={{
        fontSize: 'clamp(1rem, 2vw, 2rem)',
        lineHeight: 'clamp(1.2rem, 1.5vh, 2rem)',
      }}
    />
  );
}
`;
    const issues = await runRule(source, makeConfig());
    expect(issues).toHaveLength(2);
  });

  it('ignores clamp() that aliases values with var()', async () => {
    const source = `
export function Hero() {
  return <div style={{ fontSize: 'clamp(var(--min), var(--pref), var(--max))' }} />;
}
`;
    const issues = await runRule(source, makeConfig());
    expect(issues).toHaveLength(0);
  });

  it('ignores clamp() without viewport units', async () => {
    const source = `
export function Hero() {
  return <div style={{ fontSize: 'clamp(1rem, 1.5rem, 2rem)' }} />;
}
`;
    const issues = await runRule(source, makeConfig());
    expect(issues).toHaveLength(0);
  });

  it('reports line and column from the style attribute', async () => {
    const source = `
export function Hero() {
  return (
    <div
      style={{ fontSize: 'clamp(1rem, 2vw, 2rem)' }}
    />
  );
}
`;
    const issues = await runRule(source, makeConfig());
    expect(issues).toHaveLength(1);
    expect(issues[0].line).toBe(5);
    expect(issues[0].column).toBe(7);
  });

  it('flags raw viewport units even when other values are aliased', async () => {
    const source = `
export function Hero() {
  return <div style={{ fontSize: 'clamp(var(--min), 2vw, var(--max))' }} />;
}
`;
    const issues = await runRule(source, makeConfig());
    expect(issues).toHaveLength(1);
  });

  it('ignores fully aliased viewport values', async () => {
    const source = `
export function Hero() {
  return <div style={{ fontSize: 'clamp(var(--min), var(--pref), var(--max))' }} />;
}
`;
    const issues = await runRule(source, makeConfig());
    expect(issues).toHaveLength(0);
  });

  it('flags raw viewport clamp in a Tailwind arbitrary class', async () => {
    const source = `
export function Hero() {
  return <div className="text-[clamp(1rem,2vw,2rem)]" />;
}
`;
    const issues = await runRule(source, makeConfig());
    expect(issues).toHaveLength(1);
    expect(issues[0].ruleId).toBe('visual/clamp-soup');
  });

  it('respects clampAllowlist entries', async () => {
    const source = `
export function Hero() {
  return <div style={{ fontSize: 'clamp(1rem, 2vw, 2rem)' }} />;
}
`;
    const issues = await runRule(
      source,
      makeConfig({ clampAllowlist: ['clamp(1rem, 2vw, 2rem)'] }),
    );
    expect(issues).toHaveLength(0);
  });

  it('respects clampAllowlist regex patterns', async () => {
    const source = `
export function Hero() {
  return <div style={{ fontSize: 'clamp(1rem, 2vw, 2rem)' }} />;
}
`;
    const issues = await runRule(source, makeConfig({ clampAllowlist: [/clamp\([^)]*2vw[^)]*\)/i] }));
    expect(issues).toHaveLength(0);
  });
});
