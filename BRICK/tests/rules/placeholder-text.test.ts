import { describe, expect, it } from 'vitest';
import { writeFileSync, mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { parseFile } from '../../src/engine/parser';
import { extractFacts } from '../../src/engine/visitor';
import { placeholderTextRule } from '../../src/rules/typo/placeholder-text';
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
  const dir = mkdtempSync(join(tmpdir(), 'slop-audit-placeholder-text-test-'));
  try {
    const filePath = join(dir, 'Component.tsx');
    writeFileSync(filePath, source);
    const { ast, nodeCount } = await parseFile(filePath);
    const facts = extractFacts(filePath, ast, nodeCount);
    const context: RuleContext = { config, filePath, cwd: dir };
    const ruleContext = placeholderTextRule.create(context);
    return placeholderTextRule.analyze(ruleContext, facts);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('typo/placeholder-text', () => {
  it('flags lorem ipsum', async () => {
    const issues = await runRule(`const copy = "Lorem ipsum dolor sit amet";`, makeConfig());
    expect(issues).toHaveLength(1);
    expect(issues[0].message).toContain('Lorem ipsum');
  });

  it('flags todo comments in strings', async () => {
    const issues = await runRule(`const note = "TODO: fix this";`, makeConfig());
    expect(issues).toHaveLength(1);
    expect(issues[0].message).toContain('TODO: fix this');
  });

  it('respects custom denylist from ruleConfig', async () => {
    const issues = await runRule(
      `const label = "beta feature";`,
      makeConfig({ ruleConfig: { placeholderDenylist: ['beta feature'] } }),
    );
    expect(issues).toHaveLength(1);
    expect(issues[0].message).toContain('beta feature');
  });

  it('does not flag normal copy', async () => {
    const issues = await runRule(`const label = "Save changes";`, makeConfig());
    expect(issues).toHaveLength(0);
  });

  it('does not flag words that merely contain a denylist term', async () => {
    const issues = await runRule(`const networks = new Set(['mastodon', 'todoist']);`, makeConfig());
    expect(issues).toHaveLength(0);
  });

  it('does not flag BEM-style class names containing "placeholder"', async () => {
    const issues = await runRule(`const cls = 'home-lead-cover--placeholder';`, makeConfig());
    expect(issues).toHaveLength(0);
  });
});
