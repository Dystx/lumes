import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { createHash } from 'crypto';
import { join } from 'path';
import { VERSION } from '../types';
import { DEFAULT_CONFIG } from '../config';
import type { BaselineCache, ResolvedConfig } from '../types';

const BASELINE_VERSION = VERSION;

function parseVersion(version: string): [number, number, number] {
  const parts = version.split('.').map((part) => parseInt(part, 10));
  return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0];
}

function sanitizeForHash(value: unknown): unknown {
  if (value instanceof RegExp) {
    return { __type: 'RegExp', source: value.source, flags: value.flags };
  }
  if (Array.isArray(value)) {
    return value.map(sanitizeForHash);
  }
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, sanitizeForHash(v)]),
    );
  }
  return value;
}

function valuesEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a instanceof RegExp && b instanceof RegExp) {
    return a.source === b.source && a.flags === b.flags;
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((item, index) => valuesEqual(item, b[index]));
  }
  if (a !== null && b !== null && typeof a === 'object' && typeof b === 'object') {
    const aKeys = Object.keys(a);
    const bKeys = Object.keys(b);
    if (aKeys.length !== bKeys.length) return false;
    const aRecord = a as Record<string, unknown>;
    const bRecord = b as Record<string, unknown>;
    return aKeys.every((key) => valuesEqual(aRecord[key], bRecord[key]));
  }
  return false;
}

const BASELINE_HASH_KEYS = new Set<keyof ResolvedConfig>([
  'framework',
  'hasTailwind',
  'supportsRsc',
  'rules',
  'categoryWeights',
  'frameworkMultipliers',
  'ruleConfig',
  'gapTokens',
  'contextTaxCaps',
  'spacingScale',
  'typographyScale',
  'arbitraryValueAllowlist',
  'clampAllowlist',
  'wcag',
]);

function stripDefaults(value: unknown, defaultValue: unknown): unknown {
  if (valuesEqual(value, defaultValue)) return undefined;

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeForHash(item));
  }

  if (value !== null && typeof value === 'object') {
    const defaultRecord = (defaultValue ?? {}) as Record<string, unknown>;
    const valueRecord = value as Record<string, unknown>;
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(valueRecord)) {
      const stripped = stripDefaults(val, defaultRecord[key]);
      if (stripped !== undefined) {
        result[key] = stripped;
      }
    }
    return result;
  }

  return sanitizeForHash(value);
}

function pickBaselineConfig(config: ResolvedConfig): Record<string, unknown> {
  const picked: Record<string, unknown> = {};
  const defaultRecord = DEFAULT_CONFIG as unknown as Record<string, unknown>;
  const configRecord = config as unknown as Record<string, unknown>;
  for (const key of BASELINE_HASH_KEYS) {
    const value = configRecord[key];
    if (value === undefined) continue;
    const stripped = stripDefaults(value, defaultRecord[key]);
    if (stripped !== undefined) {
      picked[key] = stripped;
    }
  }
  return picked;
}

export function hashConfig(config: ResolvedConfig): string {
  return createHash('sha256')
    .update(JSON.stringify(sanitizeForHash(pickBaselineConfig(config))))
    .digest('hex');
}

export function baselinePath(projectPath: string): string {
  return join(projectPath, '.slop-audit', 'cache', 'baseline.json');
}

function isBaselineCache(value: unknown): value is BaselineCache {
  if (!value || typeof value !== 'object') return false;
  const obj = value as Record<string, unknown>;
  if (typeof obj.version !== 'string') return false;
  if (typeof obj.config_hash !== 'string') return false;
  if (typeof obj.git_head !== 'string') return false;
  if (typeof obj.baseline_created !== 'string') return false;
  if (typeof obj.baseline_revision !== 'number') return false;
  if (typeof obj.totalComponentCount !== 'number') return false;
  if (!obj.scores || typeof obj.scores !== 'object') return false;
  for (const entry of Object.values(obj.scores)) {
    if (!entry || typeof entry !== 'object') return false;
    const score = entry as Record<string, unknown>;
    if (typeof score.baselineScore !== 'number') return false;
    if (typeof score.componentCount !== 'number') return false;
  }
  return true;
}

export function loadBaseline(projectPath: string): BaselineCache | undefined {
  const path = baselinePath(projectPath);
  if (!existsSync(path)) return undefined;
  try {
    const content = readFileSync(path, 'utf-8');
    const parsed = JSON.parse(content);
    if (!isBaselineCache(parsed)) {
      console.error(`Invalid baseline cache at ${path}; ignoring.`);
      return undefined;
    }
    return parsed;
  } catch (err) {
    console.error(`Failed to load baseline cache at ${path}:`, err);
    return undefined;
  }
}

export function saveBaseline(projectPath: string, cache: BaselineCache): void {
  const path = baselinePath(projectPath);
  mkdirSync(join(projectPath, '.slop-audit', 'cache'), { recursive: true });
  writeFileSync(path, JSON.stringify(cache, null, 2));
}

export function tightenBaseline(cache: BaselineCache): BaselineCache {
  const next = { ...cache };
  next.baseline_revision = cache.baseline_revision + 1;
  next.scores = {};
  for (const [file, score] of Object.entries(cache.scores)) {
    next.scores[file] = {
      ...score,
      baselineScore: Math.round(score.baselineScore * 0.9 * 100) / 100,
    };
  }
  return next;
}

export function validateBaseline(
  cache: BaselineCache,
  configHash: string,
  gitHead: string,
): { valid: boolean; reason?: string; warning?: string } {
  const current = parseVersion(BASELINE_VERSION);
  const cached = parseVersion(cache.version);

  if (current[0] !== cached[0]) {
    return {
      valid: false,
      reason: `baseline major version mismatch (${cache.version} vs ${BASELINE_VERSION})`,
    };
  }

  if (current[1] !== cached[1] || current[2] !== cached[2]) {
    return {
      valid: true,
      warning: `baseline minor/patch version mismatch (${cache.version} vs ${BASELINE_VERSION}); migrating`,
    };
  }

  if (cache.config_hash !== configHash) return { valid: false, reason: 'config_hash mismatch' };
  if (cache.git_head !== gitHead) return { valid: false, reason: 'git_head mismatch' };
  return { valid: true };
}
