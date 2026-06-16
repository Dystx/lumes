import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { shadcnPropMismatchRule } from '../../src/rules/component/shadcn';
import { loadRegistrySnapshot, refreshRegistrySnapshot, isRegistryFresh } from '../../src/rules/registry-loader';
import type { ResolvedConfig, ScanFacts } from '../../src/types';

function makeFacts(filePath: string, elements: ScanFacts['allElements']): ScanFacts {
  return {
    filePath,
    astNodeCount: 10,
    components: [],
    staticClassNames: [],
    interactiveElements: [],
    allElements: elements,
    imageElements: [],
    imports: [],
    hooks: [],
    logicalExpressions: [],
    styleProps: [],
    astroComponents: [],
  };
}

const baseConfig: ResolvedConfig = {
  include: [],
  exclude: [],
  rules: { 'component/shadcn-prop-mismatch': 'high' },
  frameworkMultipliers: {},
  ruleConfig: {},
  contextTaxCaps: { cleanCap: 1.5, standardCap: 2.0 },
  thresholds: { meanSlop: 25, p90Slop: 50, individualSlopThreshold: 50 },
  arbitraryValueAllowlist: [],
  wcag: { targetSizeExemptSelectors: [] },
};

describe('component/shadcn-prop-mismatch', () => {
  let cwd: string;

  beforeEach(() => {
    cwd = mkdtempSync(join(tmpdir(), 'slop-audit-shadcn-'));
    mkdirSync(join(cwd, '.slop-audit', 'cache'), { recursive: true });
    writeFileSync(
      join(cwd, '.slop-audit', 'cache', 'registry-snapshot.json'),
      JSON.stringify({
        version: '1.0.0',
        updatedAt: '2026-06-15',
        components: {
          CustomCard: { forbiddenProps: ['className'] },
          AllowedCard: { forbiddenProps: [] },
        },
      }),
    );
  });

  afterEach(() => {
    rmSync(cwd, { recursive: true, force: true });
  });

  it('flags className on a component that forbids it', () => {
    const context = shadcnPropMismatchRule.create({ config: baseConfig, filePath: '/x.tsx', cwd });
    const facts = makeFacts('/x.tsx', [
      { tag: 'CustomCard', attributes: { className: 'm-2' }, classNames: [], line: 2, column: 3 },
    ]);
    const issues = shadcnPropMismatchRule.analyze(context, facts);
    expect(issues).toHaveLength(1);
    expect(issues[0].ruleId).toBe('component/shadcn-prop-mismatch');
    expect(issues[0].message).toContain('CustomCard');
  });

  it('ignores components not in the registry', () => {
    const context = shadcnPropMismatchRule.create({ config: baseConfig, filePath: '/x.tsx', cwd });
    const facts = makeFacts('/x.tsx', [
      { tag: 'Unknown', attributes: { className: 'm-2' }, classNames: [], line: 2, column: 3 },
    ]);
    expect(shadcnPropMismatchRule.analyze(context, facts)).toHaveLength(0);
  });

  it('ignores className on components that allow it', () => {
    const context = shadcnPropMismatchRule.create({ config: baseConfig, filePath: '/x.tsx', cwd });
    const facts = makeFacts('/x.tsx', [
      { tag: 'AllowedCard', attributes: { className: 'm-2' }, classNames: [], line: 2, column: 3 },
    ]);
    expect(shadcnPropMismatchRule.analyze(context, facts)).toHaveLength(0);
  });

  it('is disabled when rule severity is off', () => {
    const config: ResolvedConfig = { ...baseConfig, rules: { 'component/shadcn-prop-mismatch': 'off' } };
    const context = shadcnPropMismatchRule.create({ config, filePath: '/x.tsx', cwd });
    const facts = makeFacts('/x.tsx', [
      { tag: 'CustomCard', attributes: { className: 'm-2' }, classNames: [], line: 2, column: 3 },
    ]);
    expect(shadcnPropMismatchRule.analyze(context, facts)).toHaveLength(0);
  });
});

describe('registry-loader', () => {
  let cwd: string;

  beforeEach(() => {
    cwd = mkdtempSync(join(tmpdir(), 'slop-audit-registry-'));
  });

  afterEach(() => {
    rmSync(cwd, { recursive: true, force: true });
  });

  it('falls back to bundled snapshot when cache is missing', () => {
    const snapshot = loadRegistrySnapshot(cwd);
    expect(snapshot.version).toBeDefined();
    expect(Object.keys(snapshot.components).length).toBeGreaterThan(0);
  });

  it('loads a cached snapshot when present', () => {
    mkdirSync(join(cwd, '.slop-audit', 'cache'), { recursive: true });
    writeFileSync(
      join(cwd, '.slop-audit', 'cache', 'registry-snapshot.json'),
      JSON.stringify({ version: 'test', updatedAt: '', components: { Foo: { forbiddenProps: ['className'] } } }),
    );
    const snapshot = loadRegistrySnapshot(cwd);
    expect(snapshot.version).toBe('test');
    expect(snapshot.components.Foo).toBeDefined();
  });

  it('reports cache as not fresh when missing', () => {
    expect(isRegistryFresh(cwd)).toBe(false);
  });

  it('refresh falls back to bundled snapshot on network failure', async () => {
    const result = await refreshRegistrySnapshot(cwd, 'http://localhost:0/__invalid__/registry.json', 100);
    expect(result.ok).toBe(false);
    expect(result.message).toContain('bundled');
    expect(existsSync(join(cwd, '.slop-audit', 'cache', 'registry-snapshot.json'))).toBe(false);
  });
});
