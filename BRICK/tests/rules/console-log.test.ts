import { describe, expect, it } from 'vitest';
import { writeFileSync, mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { parseFile } from '../../src/engine/parser';
import { extractFacts } from '../../src/engine/visitor';
import { consoleLogRule } from '../../src/rules/logic/console-log';
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
  const dir = mkdtempSync(join(tmpdir(), 'slop-audit-console-log-test-'));
  try {
    const filePath = join(dir, 'Component.tsx');
    writeFileSync(filePath, source);
    const { ast, nodeCount } = await parseFile(filePath);
    const facts = extractFacts(filePath, ast, nodeCount);
    const context: RuleContext = { config, filePath, cwd: dir };
    const ruleContext = consoleLogRule.create(context);
    return consoleLogRule.analyze(ruleContext, facts);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('logic/console-log', () => {
  it('flags console.log', async () => {
    const issues = await runRule(`console.log('debug');`, makeConfig());
    expect(issues).toHaveLength(1);
    expect(issues[0].message).toBe('Console.log call left in source');
  });

  it('flags multiple console methods', async () => {
    const source = `
console.warn('warn');
console.error('error');
console.info('info');
`;
    const issues = await runRule(source, makeConfig());
    expect(issues).toHaveLength(3);
    expect(issues.map((i) => i.message).sort()).toEqual([
      'Console.error call left in source',
      'Console.info call left in source',
      'Console.warn call left in source',
    ]);
  });

  it('does not flag non-console calls', async () => {
    const issues = await runRule(`logger.log('debug');`, makeConfig());
    expect(issues).toHaveLength(0);
  });
});
