import { existsSync, readFileSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import { createRequire } from 'node:module';
import type { ResolvedConfig, RuleSeverity, Severity } from './types';

export const DEFAULT_SPACING_SCALE = [
  0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 5, 6, 7, 8, 9, 10,
  11, 12, 14, 16, 20, 24, 28, 32, 36, 40, 44, 48, 52, 56, 60, 64, 72, 80, 96,
];

export const DEFAULT_TYPOGRAPHY_SCALE = [
  '0.75rem', '0.875rem', '1rem', '1.125rem', '1.25rem',
  '1.5rem', '1.875rem', '2.25rem', '3rem', '3.75rem', '4.5rem',
];

export const DEFAULT_CONFIG: ResolvedConfig = {
  include: [
    'app/**/*.{ts,tsx,js,jsx,vue,svelte,astro}',
    'src/**/*.{ts,tsx,js,jsx,vue,svelte,astro}',
    'components/**/*.{ts,tsx,js,jsx,vue,svelte,astro}',
    'pages/**/*.{ts,tsx,js,jsx,vue,svelte,astro}',
  ],
  exclude: ['**/node_modules/**', '**/.next/**', '**/dist/**'],
  projectMemory: true,
  telemetry: true,
  categoryWeights: {
    visual: 1.2,
    logic: 1.0,
    perf: 0.8,
    typo: 0.5,
    wcag: 1.0,
    layout: 1.0,
    component: 1.0,
    arch: 1.0,
  },
  rules: {
    'visual/arbitrary-escape': 'medium',
    'visual/clamp-soup': 'high',
    'visual/forced-layout': 'medium',
    'visual/generic-centering': 'low',
    'visual/inline-style': 'auto',
    'visual/raw-style-values': 'low',
    'visual/hardcoded-color': 'low',
    'logic/boundary-violation': 'high',
    'logic/qwik-hook-leak': 'high',
    'logic/reactive-hook-soup': 'medium',
    'logic/zombie-state': 'medium',
    'logic/ghost-defensive': 'medium',
    'logic/style-sheet-avoidance': 'medium',
    'logic/console-log': 'low',
    'typo/placeholder-text': 'low',
    'wcag/target-size': 'high',
    'wcag/focus-appearance': 'high',
    'wcag/focus-obscured': 'low',
    'wcag/dragging-movements': 'medium',
    'wcag/color-contrast': 'medium',
    'typo/calc-raw-px': 'high',
    'typo/calc-fontsize': 'medium',
    'typo/clamp-offscale': 'medium',
    'perf/cls-image': 'low',
    'layout/gap-monopoly': 'medium',
    'layout/duplicated-screen': 'medium',
    'component/duplicated-component': 'medium',
    'perf/css-bloat': 'low',
    'component/shadcn-prop-mismatch': 'high',
    'arch/astro-island-leak': 'low',
    'layout/spacing-grid': 'medium',
  },
  frameworkMultipliers: {
    react: 1.0,
    vue: 1.0,
    svelte: 1.0,
    solid: 1.0,
    qwik: 1.0,
    astro: 1.0,
    'react-native': 1.0,
    expo: 1.0,
  },
  spacingScale: DEFAULT_SPACING_SCALE,
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
  clampAllowlist: [],
  wcag: {
    targetSizeExemptSelectors: [],
    targetSizeRequireTailwind: true,
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

const WORKSPACE_FILES = ['pnpm-workspace.yaml', 'pnpm-workspace.yml', 'turbo.json'];

export function detectMonorepoRoot(cwd: string): string | undefined {
  let current = resolve(cwd);
  while (true) {
    for (const name of WORKSPACE_FILES) {
      if (existsSync(join(current, name))) {
        return current;
      }
    }
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return undefined;
}

const NATIVE_RULE_OVERRIDES: Record<string, RuleSeverity | 'off'> = {
  'logic/boundary-violation': 'off',
  'perf/css-bloat': 'off',
  'wcag/target-size': 'off',
  'wcag/focus-appearance': 'off',
  'wcag/focus-obscured': 'off',
  'wcag/dragging-movements': 'off',
  'wcag/color-contrast': 'off',
  'perf/cls-image': 'off',
  'component/shadcn-prop-mismatch': 'off',
  'arch/astro-island-leak': 'off',
};

export function detectStack(cwd: string): Partial<ResolvedConfig> {
  const pkgPath = join(cwd, 'package.json');
  if (!existsSync(pkgPath)) {
    return {};
  }
  try {
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
    const deps = {
      ...pkg.dependencies,
      ...pkg.devDependencies,
      ...pkg.peerDependencies,
    };
    const names = Object.keys(deps).map((name) => name.toLowerCase());
    const result: Partial<ResolvedConfig> = {};

    const hasExpo = names.includes('expo') || names.some((n) => n.startsWith('expo-'));
    const hasReactNative = names.includes('react-native');

    if (hasExpo || hasReactNative) {
      result.framework = hasExpo ? 'expo' : 'react-native';
      result.supportsRsc = false;
      result.rules = { ...NATIVE_RULE_OVERRIDES };
    } else if (names.includes('next')) {
      result.framework = 'react';
      result.supportsRsc = true;
    } else if (names.some((n) => n === 'astro')) {
      result.framework = 'astro';
      result.supportsRsc = true;
    } else if (names.some((n) => n.includes('qwik'))) {
      result.framework = 'qwik';
      result.supportsRsc = false;
    } else if (names.some((n) => n === 'svelte' || n.includes('sveltekit'))) {
      result.framework = 'svelte';
      result.supportsRsc = false;
    } else if (names.some((n) => n === 'vue' || n === 'nuxt')) {
      result.framework = 'vue';
      result.supportsRsc = false;
    } else if (names.some((n) => n === 'solid-js')) {
      result.framework = 'solid';
      result.supportsRsc = false;
    } else if (names.some((n) => n === 'react' || n === 'preact')) {
      result.framework = 'react';
      result.supportsRsc = false;
    }

    if (names.includes('tailwindcss')) {
      result.hasTailwind = true;
    }
    // Fall back to config file presence for monorepos / non-npm installs.
    if (!result.hasTailwind) {
      const tailwindConfigFiles = [
        'tailwind.config.js',
        'tailwind.config.mjs',
        'tailwind.config.cjs',
        'tailwind.config.ts',
      ];
      const root = resolve(cwd);
      result.hasTailwind = tailwindConfigFiles.some((name) => existsSync(join(root, name)));
    }
    return result;
  } catch {
    // ignore malformed package.json
  }
  return {};
}

export async function loadConfig(cwd: string): Promise<ResolvedConfig> {
  const detected = detectStack(cwd);
  const configPath = resolveConfigPath(cwd);
  if (!configPath) {
    return deepMerge(DEFAULT_CONFIG, detected);
  }
  const user = await loadConfigFile(configPath);
  return deepMerge(deepMerge(DEFAULT_CONFIG, detected), user as Partial<ResolvedConfig>);
}
