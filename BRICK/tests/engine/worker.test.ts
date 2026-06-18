import { describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { scanFile } from '../../src/engine/worker';
import { DEFAULT_CONFIG } from '../../src/config';
import type { ResolvedConfig } from '../../src/types';

const fixture = (name: string) => join(__dirname, `../fixtures/${name}.tsx`);

describe('scanFile', () => {
  it('returns a FileScanResult for a valid TSX file', async () => {
    const result = await scanFile(fixture('sample'), { ...DEFAULT_CONFIG, hasTailwind: true });

    expect(result.parseError).toBeUndefined();
    expect(result.filePath).toBe(fixture('sample'));
    expect(result.componentCount).toBeGreaterThan(0);
    expect(result.astNodeCount).toBeGreaterThan(0);
    const ruleIds = result.issues.map((i) => i.ruleId).sort();
    expect(ruleIds).toContain('logic/boundary-violation');
    expect(ruleIds).toContain('wcag/target-size');
    expect(result.issues.some((i) => i.severity === 'high')).toBe(true);
  });

  it('respects config.rules severity overrides and off state', async () => {
    const config: ResolvedConfig = {
      ...DEFAULT_CONFIG,
      hasTailwind: true,
      rules: {
        ...DEFAULT_CONFIG.rules,
        'logic/boundary-violation': 'off',
        'wcag/target-size': 'low',
      },
    };
    const result = await scanFile(fixture('sample'), config);

    expect(result.issues.some((i) => i.ruleId === 'logic/boundary-violation')).toBe(false);
    const targetSize = result.issues.filter((i) => i.ruleId === 'wcag/target-size');
    expect(targetSize.length).toBeGreaterThan(0);
    expect(targetSize.every((i) => i.severity === 'low')).toBe(true);
  });

  it("preserves rule severity when set to 'auto'", async () => {
    const dir = mkdtempSync(join(tmpdir(), 'slop-audit-worker-auto-test-'));
    const file = join(dir, 'inline.tsx');
    writeFileSync(
      file,
      `export function Card() {
        return (
          <>
            <div style={{ padding: 8 }}>1</div>
            <h1 style={{ fontSize: 24 }}>Title</h1>
            <p style={{ color: 'red' }}>Body</p>
            <button style={{ marginTop: 16 }}>Action</button>
            <span style={{ display: 'block' }}>Span</span>
            <section style={{ border: '1px solid' }}>Section</section>
          </>
        );
      }`,
    );

    try {
      const config: ResolvedConfig = {
        ...DEFAULT_CONFIG,
        hasTailwind: true,
        rules: {
          ...DEFAULT_CONFIG.rules,
          'visual/inline-style': 'auto',
        },
      };
      const result = await scanFile(file, config);

      const inlineIssues = result.issues.filter((i) => i.ruleId === 'visual/inline-style');
      expect(inlineIssues.length).toBeGreaterThan(0);
      expect(inlineIssues.some((i) => i.severity === 'high')).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("overrides dynamic severity when a rule is set to a concrete severity", async () => {
    const dir = mkdtempSync(join(tmpdir(), 'slop-audit-worker-override-test-'));
    const file = join(dir, 'inline.tsx');
    writeFileSync(
      file,
      `export function Card() {
        return (
          <div style={{ padding: 8 }}>
            <h1 style={{ fontSize: 24 }}>Title</h1>
            <p style={{ color: 'red' }}>Body</p>
            <button style={{ marginTop: 16 }}>Action</button>
          </div>
        );
      }`,
    );

    try {
      const config: ResolvedConfig = {
        ...DEFAULT_CONFIG,
        hasTailwind: true,
        rules: {
          ...DEFAULT_CONFIG.rules,
          'visual/inline-style': 'medium',
        },
      };
      const result = await scanFile(file, config);

      const inlineIssues = result.issues.filter((i) => i.ruleId === 'visual/inline-style');
      expect(inlineIssues.length).toBeGreaterThan(0);
      expect(inlineIssues.every((i) => i.severity === 'medium')).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('returns a parseError for a malformed file', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'slop-audit-worker-test-'));
    const file = join(dir, 'bad.tsx');
    writeFileSync(file, `export function Button() { return <button>`);

    try {
      const result = await scanFile(file, DEFAULT_CONFIG);

      expect(result.parseError).toBeDefined();
      expect(result.componentCount).toBe(0);
      expect(result.astNodeCount).toBe(0);
      expect(result.issues).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
