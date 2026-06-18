import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readRuns, appendRun } from '../../src/engine/memory';
import type { ProjectReport } from '../../src/types';

const createTmpDir = () => mkdtempSync(join(tmpdir(), 'slop-audit-memory-test-'));

function makeReport(slopIndex = 10, overrides: Partial<ProjectReport> = {}): ProjectReport {
  return {
    version: '1.0.0',
    generatedAt: new Date().toISOString(),
    slopIndex,
    assemblyHealth: 90,
    categoryScores: {
      visual: 0,
      typo: 0,
      wcag: 0,
      layout: 0,
      component: 0,
      logic: 0,
      arch: 0,
      perf: 0,
    },
    p90Score: 15,
    peakScore: 20,
    componentCount: 2,
    fileCount: 1,
    thresholds: { meanSlop: 25, p90Slop: 50, individualSlopThreshold: 50 },
    components: [],
    issues: [],
    ...overrides,
  };
}

describe('readRuns', () => {
  let dir: string;

  beforeEach(() => {
    dir = createTmpDir();
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('returns an empty array when no memory file exists', () => {
    expect(readRuns(dir)).toEqual([]);
  });

  it('reads runs appended by appendRun', () => {
    appendRun(dir, makeReport(10), false);
    appendRun(dir, makeReport(20), true);

    const runs = readRuns(dir);
    expect(runs).toHaveLength(2);
    expect(runs[0].slopIndex).toBe(10);
    expect(runs[0].thresholdExceeded).toBe(false);
    expect(runs[1].slopIndex).toBe(20);
    expect(runs[1].thresholdExceeded).toBe(true);
  });

  it('filters out malformed entries', () => {
    appendRun(dir, makeReport(5), false);
    const memoryPath = join(dir, '.slop-audit', 'memory.json');
    const existing = readRuns(dir);
    // Intentionally writing invalid data to test filtering.
    writeFileSync(memoryPath, JSON.stringify([...existing, { invalid: true }]));

    const runs = readRuns(dir);
    expect(runs).toHaveLength(1);
    expect(runs[0].slopIndex).toBe(5);
  });

  it('caps the log at 1000 runs, dropping oldest entries', () => {
    for (let i = 0; i < 1002; i++) {
      appendRun(dir, makeReport(i), false);
    }
    const runs = readRuns(dir);
    expect(runs).toHaveLength(1000);
    expect(runs[0].slopIndex).toBe(2);
    expect(runs[runs.length - 1].slopIndex).toBe(1001);
  });
});

describe('appendRun', () => {
  let dir: string;

  beforeEach(() => {
    dir = createTmpDir();
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('stores timestamp, version, category scores, and top offense ids', () => {
    const report = makeReport(42, {
      issues: [
        {
          ruleId: 'logic/boundary-violation',
          category: 'logic',
          severity: 'high',
          aiSpecific: true,
          message: 'client hook in server component',
          line: 1,
          column: 1,
        },
        {
          ruleId: 'wcag/target-size',
          category: 'wcag',
          severity: 'high',
          aiSpecific: false,
          message: 'target size',
          line: 2,
          column: 2,
        },
      ],
    });

    appendRun(dir, report, true);

    const [run] = readRuns(dir);
    expect(run.timestamp).toBe(report.generatedAt);
    expect(run.version).toBe(report.version);
    expect(run.slopIndex).toBe(42);
    expect(run.categoryScores).toEqual(report.categoryScores);
    expect(run.topOffenseIds).toContain('logic/boundary-violation');
    expect(run.topOffenseIds).toContain('wcag/target-size');
    expect(run.thresholdExceeded).toBe(true);
  });
});
