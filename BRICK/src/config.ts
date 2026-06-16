import { existsSync, readFileSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import { createRequire } from 'node:module';
import type { ResolvedConfig } from './types';

export const DEFAULT_SPACING_SCALE = [
  0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 5, 6, 7, 8, 9, 10,
  11, 12, 14, 16, 20, 24, 28, 32, 36, 40, 44, 48, 52, 56, 60, 64, 72, 80, 96,
];

export const DEFAULT_TYPOGRAPHY_SCALE = [
  '0.75rem', '0.875rem', '1rem', '1.125rem', '1.25rem',
  '1.5rem', '1.875rem', '2.25rem', '3rem', '3.75rem', '4.5rem',
];

export const DEFAULT_CONFIG: ResolvedConfig = {
  include: ['src/**/*.{ts,tsx,js,jsx,vue,svelte,astro}'],
  exclude: ['**/node_modules/**', '**/.next/**', '**/dist/**'],
  projectMemory: true,
  rules: {
    'visual/arbitrary-escape': 'medium',
    'visual/clamp-soup': 'high',
    'visual/forced-layout': 'medium',
    'visual/generic-centering': 'low',
    'logic/boundary-violation': 'high',
    'logic/qwik-hook-leak': 'high',
    'logic/zombie-state': 'medium',
    'logic/ghost-defensive': 'medium',
    'wcag/target-size': 'high',
    'wcag/focus-appearance': 'high',
    'wcag/focus-obscured': 'low',
    'wcag/dragging-movements': 'medium',
    'typo/calc-raw-px': 'high',
    'typo/calc-fontsize': 'medium',
    'perf/cls-image': 'low',
    'layout/gap-monopoly': 'medium',
    'perf/css-bloat': 'low',
    'component/shadcn-prop-mismatch': 'high',
    'arch/astro-island-leak': 'low',
  },
  frameworkMultipliers: {
    react: 1.0,
    vue: 1.0,
    svelte: 1.0,
    solid: 1.0,
    qwik: 1.0,
    astro: 1.0,
  },
  ruleConfig: {
    genericCenteringMaxInstances: 1,
  },
  contextTaxCaps: {
    cleanCap: 1.5,
    standardCap: 2.0,
  },
  thresholds: {
    meanSlop: 25,
    p90Slop: 50,
    individualSlopThreshold: 50,
  },
  arbitraryValueAllowlist: [
    'w-full',
    /^w-\[calc\(.*\)\]$/,
    'top-[var(--header-height)]',
  ],
  wcag: {
    targetSizeExemptSelectors: [],
  },
};

function deepMerge<T extends object>(target: T, source: Partial<T>): T {
  const out = { ...target } as Record<string, unknown>;
  for (const key of Object.keys(source)) {
    const s = (source as Record<string, unknown>)[key];
    if (s && typeof s === 'object' && !Array.isArray(s) && out[key] && typeof out[key] === 'object') {
      out[key] = deepMerge(out[key] as Record<string, unknown>, s as Record<string, unknown>);
    } else if (s !== undefined) {
      out[key] = s;
    }
  }
  return out as T;
}

function resolveConfigPath(dir: string): string | undefined {
  const candidates = ['slop-audit.config.mjs', 'slop-audit.config.cjs', 'slop-audit.config.js'];
  let current = resolve(dir);
  while (true) {
    for (const name of candidates) {
      const full = join(current, name);
      if (existsSync(full)) return full;
    }
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return undefined;
}

function detectJsLoader(configPath: string): 'import' | 'require' {
  const ext = extname(configPath);
  if (ext === '.mjs') return 'import';
  if (ext === '.cjs') return 'require';
  // For .js, inspect nearest package.json type field.
  let current = dirname(resolve(configPath));
  while (true) {
    const pkgPath = join(current, 'package.json');
    if (existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
        return pkg.type === 'module' ? 'import' : 'require';
      } catch {
        return 'require';
      }
    }
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return 'require';
}

async function loadConfigFile(path: string): Promise<Partial<ResolvedConfig>> {
  const loader = detectJsLoader(path);
  if (loader === 'require') {
    const req = createRequire(import.meta.url);
    const mod = req(path);
    return mod.default ?? mod;
  }
  const mod = await import(path);
  return mod.default ?? mod;
}

export async function loadConfig(cwd: string): Promise<ResolvedConfig> {
  const configPath = resolveConfigPath(cwd);
  if (!configPath) {
    return DEFAULT_CONFIG;
  }
  const user = await loadConfigFile(configPath);
  return deepMerge(DEFAULT_CONFIG, user as Partial<ResolvedConfig>);
}
