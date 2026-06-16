import { describe, expect, it } from 'vitest';
import { writeFileSync, mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { parseFile } from '../../src/engine/parser';
import { extractFacts } from '../../src/engine/visitor';
import { forcedLayoutRule } from '../../src/rules/visual/forced-layout';
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
): Promise<ReturnType<typeof forcedLayoutRule.analyze>> {
  const dir = mkdtempSync(join(tmpdir(), 'slop-audit-forced-layout-test-'));
  try {
    const filePath = join(dir, fileName);
    writeFileSync(filePath, source);
    const { ast, nodeCount } = await parseFile(filePath);
    const facts = extractFacts(filePath, ast, nodeCount);
    const context: RuleContext = { config, filePath, cwd: dir };
    const ruleContext = forcedLayoutRule.create(context);
    return forcedLayoutRule.analyze(ruleContext, facts);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('forced-layout', () => {
  it('allows instances up to the default threshold', async () => {
    const source = `
export function Page() {
  return (
    <>
      <div className="flex flex-col gap-4">A</div>
      <div className="flex flex-col gap-4">B</div>
      <div className="flex flex-col gap-4">C</div>
    </>
  );
}
`;
    const issues = await runRule(source, makeConfig());
    expect(issues).toHaveLength(0);
  });

  it('flags when instances exceed the default threshold', async () => {
    const source = `
export function Page() {
  return (
    <>
      <div className="flex flex-col gap-4">A</div>
      <div className="flex flex-col gap-4">B</div>
      <div className="flex flex-col gap-4">C</div>
      <div className="flex flex-col gap-4">D</div>
    </>
  );
}
`;
    const issues = await runRule(source, makeConfig());
    expect(issues).toHaveLength(1);
    expect(issues[0].ruleId).toBe('visual/forced-layout');
    expect(issues[0].severity).toBe('medium');
    expect(issues[0].aiSpecific).toBe(true);
    expect(issues[0].message).toBe(
      'Repetitive flex-col gap wrapper pattern detected (4 instances)',
    );
    expect(issues[0].advice).toBe(
      'Extract a reusable layout component or restrict gapTokens to intentional values.',
    );
    expect(issues[0].line).toBe(5);
  });

  it('respects a configured threshold', async () => {
    const source = `
export function Page() {
  return (
    <>
      <div className="flex flex-col gap-4">A</div>
      <div className="flex flex-col gap-4">B</div>
    </>
  );
}
`;
    const issues = await runRule(
      source,
      makeConfig({ ruleConfig: { forcedLayoutThreshold: 1 } }),
    );
    expect(issues).toHaveLength(1);
    expect(issues[0].message).toBe(
      'Repetitive flex-col gap wrapper pattern detected (2 instances)',
    );
  });

  it('ignores classes missing flex, flex-col, or gap', async () => {
    const source = `
export function Page() {
  return (
    <>
      <div className="flex flex-col">A</div>
      <div className="flex gap-4">B</div>
      <div className="flex flex-row gap-4">C</div>
    </>
  );
}
`;
    const issues = await runRule(source, makeConfig());
    expect(issues).toHaveLength(0);
  });

  it('only counts gap tokens from allowlist when gapTokens is configured', async () => {
    const source = `
export function Page() {
  return (
    <>
      <div className="flex flex-col gap-4">A</div>
      <div className="flex flex-col gap-4">B</div>
      <div className="flex flex-col gap-4">C</div>
      <div className="flex flex-col gap-8">D</div>
    </>
  );
}
`;
    const issues = await runRule(
      source,
      makeConfig({ gapTokens: ['gap-4'], ruleConfig: { forcedLayoutThreshold: 2 } }),
    );
    expect(issues).toHaveLength(1);
    expect(issues[0].message).toBe(
      'Repetitive flex-col gap wrapper pattern detected (3 instances)',
    );
  });

  it('falls back to any gap- prefix when gapTokens is empty', async () => {
    const source = `
export function Page() {
  return (
    <>
      <div className="flex flex-col gap-4">A</div>
      <div className="flex flex-col gap-8">B</div>
      <div className="flex flex-col gap-4">C</div>
    </>
  );
}
`;
    const issues = await runRule(source, makeConfig({ gapTokens: [] }));
    expect(issues).toHaveLength(0);
  });
});
