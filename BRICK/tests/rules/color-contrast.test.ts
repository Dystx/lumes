import { describe, expect, it } from 'vitest';
import { writeFileSync, mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { parseFile } from '../../src/engine/parser';
import { extractFacts } from '../../src/engine/visitor';
import { colorContrastRule } from '../../src/rules/wcag/color-contrast';
import { DEFAULT_CONFIG } from '../../src/config';
import type { ResolvedConfig, RuleContext } from '../../src/types';

function makeConfig(overrides?: Partial<ResolvedConfig>): ResolvedConfig {
  return {
    ...DEFAULT_CONFIG,
    ...overrides,
  };
}

async function runRule(source: string, config: ResolvedConfig): Promise<ReturnType<typeof colorContrastRule.analyze>> {
  const dir = mkdtempSync(join(tmpdir(), 'slop-audit-color-contrast-test-'));
  try {
    const filePath = join(dir, 'Component.tsx');
    writeFileSync(filePath, source);
    const { ast, nodeCount } = await parseFile(filePath);
    const facts = extractFacts(filePath, ast, nodeCount);
    const context: RuleContext = { config, filePath, cwd: dir };
    const ruleContext = colorContrastRule.create(context);
    return colorContrastRule.analyze(ruleContext, facts);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('wcag/color-contrast', () => {
  it('flags low-contrast hex foreground and background', async () => {
    const issues = await runRule(
      `export function Box() { return <div style={{ color: '#888888', backgroundColor: '#ffffff' }} />; }`,
      makeConfig(),
    );
    expect(issues).toHaveLength(1);
    expect(issues[0].ruleId).toBe('wcag/color-contrast');
    expect(issues[0].message).toContain('3.');
  });

  it('allows high-contrast hex pairs', async () => {
    const issues = await runRule(
      `export function Box() { return <div style={{ color: '#000000', backgroundColor: '#ffffff' }} />; }`,
      makeConfig(),
    );
    expect(issues).toHaveLength(0);
  });

  it('flags low-contrast rgb values', async () => {
    const issues = await runRule(
      `export function Box() { return <div style={{ color: 'rgb(136,136,136)', background: 'rgb(255,255,255)' }} />; }`,
      makeConfig(),
    );
    expect(issues).toHaveLength(1);
  });

  it('ignores styles without both color and background', async () => {
    const issues = await runRule(
      `export function Box() { return <div style={{ color: '#888888' }} />; }`,
      makeConfig(),
    );
    expect(issues).toHaveLength(0);
  });

  it('ignores unparsable color values', async () => {
    const issues = await runRule(
      `export function Box() { return <div style={{ color: 'red', backgroundColor: 'blue' }} />; }`,
      makeConfig(),
    );
    expect(issues).toHaveLength(0);
  });
});
