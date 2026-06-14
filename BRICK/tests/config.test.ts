import { describe, expect, it } from 'vitest';
import { loadConfig, DEFAULT_CONFIG } from '../src/config';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'fs';
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

  it('finds config in a parent directory', async () => {
    const dir = createTmpDir();
    try {
      writeFileSync(
        join(dir, 'slop-audit.config.mjs'),
        `export default { thresholds: { meanSlop: 20 } };`,
      );
      const nested = join(dir, 'packages', 'app');
      mkdirSync(nested, { recursive: true });
      const config = await loadConfig(nested);
      expect(config.thresholds.meanSlop).toBe(20);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('loads a .js config via require in a CJS package', async () => {
    const dir = createTmpDir();
    try {
      writeFileSync(join(dir, 'package.json'), JSON.stringify({ type: 'commonjs' }));
      writeFileSync(
        join(dir, 'slop-audit.config.js'),
        `module.exports = { thresholds: { meanSlop: 30 } };`,
      );
      const config = await loadConfig(dir);
      expect(config.thresholds.meanSlop).toBe(30);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('loads a .js config via import in an ESM package', async () => {
    const dir = createTmpDir();
    try {
      writeFileSync(join(dir, 'package.json'), JSON.stringify({ type: 'module' }));
      writeFileSync(
        join(dir, 'slop-audit.config.js'),
        `export default { thresholds: { meanSlop: 35 } };`,
      );
      const config = await loadConfig(dir);
      expect(config.thresholds.meanSlop).toBe(35);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
