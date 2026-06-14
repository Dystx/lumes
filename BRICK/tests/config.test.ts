import { describe, expect, it } from 'vitest';
import { loadConfig, DEFAULT_CONFIG } from '../src/config';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const createTmpDir = () => mkdtempSync(join(tmpdir(), 'slop-audit-config-test-'));

describe('loadConfig', () => {
  it('returns default config when no config file exists', async () => {
    const dir = createTmpDir();
    try {
      const config = await loadConfig(dir);
      expect(config.include).toEqual(DEFAULT_CONFIG.include);
      expect(config.thresholds.meanSlop).toBe(25);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('loads an ESM config file', async () => {
    const dir = createTmpDir();
    try {
      writeFileSync(
        join(dir, 'slop-audit.config.mjs'),
        `export default { thresholds: { meanSlop: 10 } };`,
      );
      const config = await loadConfig(dir);
      expect(config.thresholds.meanSlop).toBe(10);
      expect(config.include).toEqual(DEFAULT_CONFIG.include);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('loads a CJS config file', async () => {
    const dir = createTmpDir();
    try {
      writeFileSync(
        join(dir, 'slop-audit.config.cjs'),
        `module.exports = { thresholds: { meanSlop: 15 } };`,
      );
      const config = await loadConfig(dir);
      expect(config.thresholds.meanSlop).toBe(15);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
