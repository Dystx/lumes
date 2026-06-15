import { describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { scanFile } from '../../src/engine/worker';
import { DEFAULT_CONFIG } from '../../src/config';

const fixture = (name: string) => join(__dirname, `../fixtures/${name}.tsx`);

describe('scanFile', () => {
  it('returns a FileScanResult for a valid TSX file', async () => {
    const result = await scanFile(fixture('sample'), DEFAULT_CONFIG);

    expect(result.parseError).toBeUndefined();
    expect(result.filePath).toBe(fixture('sample'));
    expect(result.componentCount).toBeGreaterThan(0);
    expect(result.astNodeCount).toBeGreaterThan(0);
    const ruleIds = result.issues.map((i) => i.ruleId).sort();
    expect(ruleIds).toContain('logic/boundary-violation');
    expect(ruleIds).toContain('wcag/target-size');
    expect(result.issues.some((i) => i.severity === 'high')).toBe(true);
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
