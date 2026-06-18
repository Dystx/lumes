import { describe, expect, it } from 'vitest';
import { loadConfig, DEFAULT_CONFIG, detectStack } from '../src/config';
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

  it('returns default categoryWeights and auto severity for visual/inline-style', async () => {
    const dir = createTmpDir();
    try {
      const config = await loadConfig(dir);
      expect(config.categoryWeights).toEqual({
        visual: 1.2,
        logic: 1.0,
        perf: 0.8,
        typo: 0.5,
        wcag: 1.0,
        layout: 1.0,
        component: 1.0,
        arch: 1.0,
      });
      expect(config.rules['visual/inline-style']).toBe('auto');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('includes app/, components/, pages/, and src/ by default', async () => {
    const dir = createTmpDir();
    try {
      const config = await loadConfig(dir);
      expect(config.include).toEqual([
        'app/**/*.{ts,tsx,js,jsx,vue,svelte,astro}',
        'src/**/*.{ts,tsx,js,jsx,vue,svelte,astro}',
        'components/**/*.{ts,tsx,js,jsx,vue,svelte,astro}',
        'pages/**/*.{ts,tsx,js,jsx,vue,svelte,astro}',
      ]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('detects Tailwind from package.json dependency', () => {
    const dir = createTmpDir();
    try {
      writeFileSync(
        join(dir, 'package.json'),
        JSON.stringify({ dependencies: { tailwindcss: '^3.0.0' } }),
      );
      expect(detectStack(dir)).toEqual({ hasTailwind: true });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('detects Tailwind from tailwind.config file when package.json lacks dependency', () => {
    const dir = createTmpDir();
    try {
      writeFileSync(join(dir, 'package.json'), JSON.stringify({ dependencies: {} }));
      writeFileSync(join(dir, 'tailwind.config.mjs'), 'export default {}');
      expect(detectStack(dir)).toEqual({ hasTailwind: true });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('detects React Native / Expo as a non-RSC native stack', () => {
    const dir = createTmpDir();
    try {
      writeFileSync(
        join(dir, 'package.json'),
        JSON.stringify({ dependencies: { 'react-native': '0.74.0', expo: '~51.0.0' } }),
      );
      const detected = detectStack(dir);
      expect(detected.framework).toBe('expo');
      expect(detected.supportsRsc).toBe(false);
      expect(detected.rules?.['logic/boundary-violation']).toBe('off');
      expect(detected.rules?.['perf/css-bloat']).toBe('off');
      expect(detected.rules?.['wcag/target-size']).toBe('off');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('detects Next.js as an RSC-capable React stack', () => {
    const dir = createTmpDir();
    try {
      writeFileSync(
        join(dir, 'package.json'),
        JSON.stringify({ dependencies: { next: '14.0.0', react: '^18.0.0' } }),
      );
      const detected = detectStack(dir);
      expect(detected.framework).toBe('react');
      expect(detected.supportsRsc).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
