import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { type Category, type ProjectReport, type SlopAuditRun, VERSION } from '../types';

const MEMORY_FILE = join('.slop-audit', 'memory.json');
const MAX_RUNS = 1000;

function memoryPath(cwd: string): string {
  return join(cwd, MEMORY_FILE);
}

function isSlopAuditRun(value: unknown): value is SlopAuditRun {
  if (typeof value !== 'object' || value === null) return false;
  const run = value as Partial<SlopAuditRun>;
  return (
    typeof run.timestamp === 'string' &&
    typeof run.version === 'string' &&
    typeof run.slopIndex === 'number' &&
    run.categoryScores !== null &&
    typeof run.categoryScores === 'object' &&
    Array.isArray(run.topOffenseIds) &&
    run.topOffenseIds.every((id) => typeof id === 'string') &&
    typeof run.thresholdExceeded === 'boolean'
  );
}

export function readRuns(cwd: string): SlopAuditRun[] {
  const path = memoryPath(cwd);
  if (!existsSync(path)) return [];
  try {
    const raw = readFileSync(path, 'utf-8');
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isSlopAuditRun);
  } catch {
    return [];
  }
}

function topOffenseIds(report: ProjectReport): string[] {
  const counts = new Map<string, number>();
  for (const issue of report.issues) {
    counts.set(issue.ruleId, (counts.get(issue.ruleId) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 5)
    .map(([ruleId]) => ruleId);
}

export function appendRun(
  cwd: string,
  report: ProjectReport,
  thresholdExceeded?: boolean,
): SlopAuditRun {
  const runs = readRuns(cwd);
  const run: SlopAuditRun = {
    timestamp: report.generatedAt,
    version: VERSION,
    slopIndex: report.slopIndex,
    categoryScores: { ...report.categoryScores } as Record<Category, number>,
    topOffenseIds: topOffenseIds(report),
    thresholdExceeded: thresholdExceeded ?? report.slopIndex > 0,
  };
  runs.push(run);
  if (runs.length > MAX_RUNS) {
    runs.splice(0, runs.length - MAX_RUNS);
  }
  const path = memoryPath(cwd);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(runs, null, 2));
  return run;
}
