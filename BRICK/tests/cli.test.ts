import { describe, expect, it, beforeAll, beforeEach, afterEach } from 'vitest';
import { writeFileSync, mkdirSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import {
  assertDistBuilt,
  binPath,
  cleanupTempDir,
  createTmpDir,
  run,
  workerScript,
} from './helpers/cli';
import {
  colorForSlop,
  formatBadge,
  thresholdExceeded,
  filterIssues,
  serializeConfig,
  scanProject,
  formatSparkline,
  DEFAULT_CONFIG,
} from '../src/index';
import type { Issue, ProjectReport, ResolvedConfig } from '../src/types';

beforeAll(assertDistBuilt);

const issue = (overrides: Partial<Issue> & Pick<Issue, 'aiSpecific' | 'category' | 'severity'>): Issue => ({
  ruleId: 'test/rule',
  message: 'test issue',
  line: 1,
  column: 1,
  ...overrides,
});

const makeReport = (
  overrides: Partial<ProjectReport> = {},
  generatedAt = '2024-01-01T00:00:00.000Z',
): ProjectReport => ({
  version: '1.0.0',
  generatedAt,
  slopIndex: 10,
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
  components: [
    {
      filePath: 'A.tsx',
      rawScore: 5,
      componentScore: 5,
      adjustedScore: 5,
      componentCount: 1,
    },
    {
      filePath: 'B.tsx',
      rawScore: 3,
      componentScore: 3,
      adjustedScore: 3,
      componentCount: 1,
    },
  ],
  issues: [],
  ...overrides,
});

describe('colorForSlop', () => {
  it('returns green for slop index below 25', () => {
    expect(colorForSlop(0)).toBe('green');
    expect(colorForSlop(24.9)).toBe('green');
  });

  it('returns yellow for slop index between 25 and 50', () => {
    expect(colorForSlop(25)).toBe('yellow');
    expect(colorForSlop(49.9)).toBe('yellow');
  });

  it('returns red for slop index 50 or above', () => {
    expect(colorForSlop(50)).toBe('red');
    expect(colorForSlop(100)).toBe('red');
  });
});

describe('formatBadge', () => {
  it('produces a shields.io markdown badge', () => {
    const report = makeReport({ slopIndex: 34.2 });
    const badge = formatBadge(report);
    expect(badge).toContain('https://img.shields.io/badge/slop--index-34-yellow');
    expect(badge).toContain('[![');
  });

  it('uses red color for high slop index', () => {
    const report = makeReport({ slopIndex: 75 });
    const badge = formatBadge(report);
    expect(badge).toContain('red');
  });
});

describe('thresholdExceeded', () => {
  const config: ResolvedConfig = {
    ...DEFAULT_CONFIG,
    thresholds: {
      meanSlop: 25,
      p90Slop: 50,
      individualSlopThreshold: 50,
    },
  };

  it('returns false when all thresholds are respected', () => {
    const report = makeReport({ slopIndex: 20, p90Score: 40, peakScore: 45 });
    expect(thresholdExceeded(report, config)).toBe(false);
  });

  it('returns true when slop index exceeds mean threshold', () => {
    const report = makeReport({ slopIndex: 26, p90Score: 40, peakScore: 45 });
    expect(thresholdExceeded(report, config)).toBe(true);
  });

  it('returns true when p90 exceeds threshold', () => {
    const report = makeReport({ slopIndex: 20, p90Score: 51, peakScore: 45 });
    expect(thresholdExceeded(report, config)).toBe(true);
  });

  it('returns true when peak exceeds threshold', () => {
    const report = makeReport({ slopIndex: 20, p90Score: 40, peakScore: 51 });
    expect(thresholdExceeded(report, config)).toBe(true);
  });
});

describe('filterIssues', () => {
  const issues: Issue[] = [
    issue({ aiSpecific: true, category: 'logic', severity: 'high' }),
    issue({ aiSpecific: false, category: 'layout', severity: 'medium' }),
    issue({ aiSpecific: false, category: 'wcag', severity: 'high' }),
  ];

  it('keeps only AI-specific issues with --ai-only', () => {
    const filtered = filterIssues(issues, { aiOnly: true });
    expect(filtered).toHaveLength(1);
    expect(filtered[0].aiSpecific).toBe(true);
  });

  it('keeps only human issues with --human-only', () => {
    const filtered = filterIssues(issues, { humanOnly: true });
    expect(filtered).toHaveLength(2);
    expect(filtered.every((i) => !i.aiSpecific)).toBe(true);
  });

  it('removes wcag issues with --ignore-wcag22', () => {
    const filtered = filterIssues(issues, { ignoreWcag22: true });
    expect(filtered).toHaveLength(2);
    expect(filtered.every((i) => i.category !== 'wcag')).toBe(true);
  });

  it('applies filters sequentially', () => {
    const filtered = filterIssues(issues, { aiOnly: true, ignoreWcag22: true });
    expect(filtered).toHaveLength(1);
    expect(filtered[0].category).toBe('logic');
  });
});

describe('serializeConfig', () => {
  it('produces a valid ESM default export', () => {
    const serialized = serializeConfig(DEFAULT_CONFIG);
    expect(serialized.startsWith('export default')).toBe(true);
    expect(serialized).toContain('"include"');
    expect(serialized).toContain('"rules"');
  });

  it('serializes regex allowlist entries as new RegExp expressions', () => {
    const serialized = serializeConfig(DEFAULT_CONFIG);
    expect(serialized).toContain('new RegExp(');
    expect(serialized).toContain('"w-full"');
  });
});

describe('scanProject', () => {
  let dir: string;

  beforeEach(() => {
    dir = createTmpDir();
  });

  afterEach(() => {
    cleanupTempDir(dir);
  });

  it('returns a report for an empty project', async () => {
    const report = await scanProject({ cwd: dir, workerScript });
    expect(report.version).toBe('1.0.0');
    expect(report.slopIndex).toBe(0);
    expect(report.assemblyHealth).toBe(100);
    expect(report.issues).toEqual([]);
    expect(report.components).toEqual([]);
  });

  it('discovers and scans source files', async () => {
    mkdirSync(join(dir, 'src'), { recursive: true });
    writeFileSync(join(dir, 'src', 'Button.tsx'), 'export function Button() { return <div>hi</div>; }');
    const report = await scanProject({ cwd: dir, workerScript });
    expect(report.components.length).toBeGreaterThan(0);
    expect(report.componentCount).toBeGreaterThan(0);
  });
});

describe('--threads validation', () => {
  it('rejects non-positive values with an error', async () => {
    const dir = createTmpDir();
    try {
      const { exitCode, stderr } = await run(['--threads', '0', '--json', '--workspace', dir]);
      expect(exitCode).not.toBe(0);
      expect(stderr).toMatch(/positive integer/i);
    } finally {
      cleanupTempDir(dir);
    }
  });
});

describe('--watch', () => {
  it('does not exit with the unimplemented warning and keeps running until SIGINT', async () => {
    const dir = createTmpDir();
    const child = spawn('node', [binPath, '--watch', '--workspace', dir], {
      cwd: dir,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    try {
      // Wait for the watcher to be ready before sending SIGINT.
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          cleanup();
          reject(new Error('Timed out waiting for watch mode to start'));
        }, 5000);

        function cleanup() {
          clearTimeout(timeout);
          child.stderr.off('data', checkReady);
        }

        function checkReady() {
          if (stderr.includes('Watching for changes')) {
            cleanup();
            resolve();
          }
        }

        child.stderr.on('data', checkReady);
        checkReady();
      });

      child.kill('SIGINT');

      const exitCode = await new Promise<number>((resolve) => {
        child.on('exit', (code) => resolve(code ?? 1));
      });

      expect(stderr).not.toContain('not implemented');
      expect(exitCode).toBe(0);
      expect(stdout).toContain('Slop Index');
    } finally {
      if (!child.killed) {
        child.kill('SIGINT');
      }
      cleanupTempDir(dir);
    }
  });
});

function writeHighSeverityFixture(dir: string): void {
  const srcDir = join(dir, 'src');
  mkdirSync(srcDir, { recursive: true });
  writeFileSync(
    join(srcDir, 'ServerHook.tsx'),
    `export function ServerHook() {
  const [count, setCount] = useState(0);
  return <div>{count}</div>;
}
`,
  );
}

function writeSloppyProject(dir: string): void {
  const srcDir = join(dir, 'src');
  mkdirSync(srcDir, { recursive: true });
  writeFileSync(
    join(srcDir, 'AiSlop.tsx'),
    `export function AiSlop() {
  return (
    <div>
      <div className="w-[100px] flex items-center justify-center min-h-screen text-center">one</div>
      <div className="h-[50px] flex items-center justify-center min-h-screen text-center">two</div>
    </div>
  );
}
`,
  );
  const buttons = Array.from({ length: 6 }, (_, i) => `      <button className="outline-none" key={${i}}>btn${i}</button>`).join('\n');
  writeFileSync(
    join(srcDir, 'WcagSlop.tsx'),
    `export function WcagSlop() {
  return (
    <div>
${buttons}
    </div>
  );
}
`,
  );
}

describe('--strict', () => {
  let dir: string;

  beforeEach(() => {
    dir = createTmpDir();
    writeSloppyProject(dir);
  });

  afterEach(() => {
    cleanupTempDir(dir);
  });

  it('exits with code 2 when high-severity issues remain', async () => {
    const { exitCode, stderr } = await run(['--workspace', dir, '--strict', '--json']);
    expect(exitCode).toBe(2);
    expect(stderr).toContain('High-severity issues found with --strict.');
  });

  it('falls back to threshold exit code 1 without --strict', async () => {
    const { exitCode } = await run(['--workspace', dir, '--json']);
    expect(exitCode).toBe(1);
  });
});

describe('--include / --exclude', () => {
  let dir: string;

  beforeEach(() => {
    dir = createTmpDir();
    writeSloppyProject(dir);
    const libDir = join(dir, 'lib');
    mkdirSync(libDir, { recursive: true });
    writeFileSync(join(libDir, 'Helper.tsx'), 'export function Helper() { return <button>ok</button>; }');
  });

  afterEach(() => {
    cleanupTempDir(dir);
  });

  it('discovers only files matching --include patterns', async () => {
    const { exitCode, stdout } = await run([
      '--workspace',
      dir,
      '--include',
      'lib/**/*.tsx',
      '--format',
      'json',
    ]);
    expect(exitCode).toBe(0);
    const report = JSON.parse(stdout) as ProjectReport;
    expect(report.components.length).toBe(1);
    expect(report.components[0].filePath).toContain(join('lib', 'Helper.tsx'));
  });

  it('skips files matching --exclude patterns while keeping default excludes', async () => {
    const { exitCode, stdout } = await run([
      '--workspace',
      dir,
      '--exclude',
      'src/AiSlop.tsx',
      '--format',
      'json',
    ]);
    expect(exitCode).toBe(1);
    const report = JSON.parse(stdout) as ProjectReport;
    const filePaths = report.components.map((c) => c.filePath);
    expect(filePaths.some((p) => p.includes('AiSlop.tsx'))).toBe(false);
    expect(filePaths.some((p) => p.includes('WcagSlop.tsx'))).toBe(true);
  });
});

describe('--no-increase', () => {
  let dir: string;

  beforeEach(() => {
    dir = createTmpDir();
  });

  afterEach(() => {
    cleanupTempDir(dir);
  });

  it('warns and does not fail when there is no previous run', async () => {
    const srcDir = join(dir, 'src');
    mkdirSync(srcDir, { recursive: true });
    writeFileSync(join(srcDir, 'Clean.tsx'), 'export function Clean() { return <div>hi</div>; }');
    const { exitCode, stderr } = await run(['--workspace', dir, '--no-increase', '--json']);
    expect(exitCode).toBe(0);
    expect(stderr).toContain('no previous run found');
  });

  it('exits 2 when slop index increased since the previous run', async () => {
    const srcDir = join(dir, 'src');
    mkdirSync(srcDir, { recursive: true });
    writeFileSync(join(srcDir, 'LowSlop.tsx'), 'export function LowSlop() { return <div>hi</div>; }');

    const first = await run(['--workspace', dir, '--json']);
    expect(first.exitCode).toBe(0);

    writeHighSeverityFixture(dir);
    const second = await run(['--workspace', dir, '--no-increase', '--json']);
    expect(second.exitCode).toBe(2);
    expect(second.stderr).toMatch(/Slop index increased from [\d.]+ to [\d.]+/);
  });
});

describe('--trend', () => {
  let dir: string;

  beforeEach(() => {
    dir = createTmpDir();
  });

  afterEach(() => {
    cleanupTempDir(dir);
  });

  it('prints a sparkline of the last n runs', async () => {
    const srcDir = join(dir, 'src');
    mkdirSync(srcDir, { recursive: true });
    const source = 'export function Button() { return <button>hi</button>; }';

    for (let i = 0; i < 5; i++) {
      writeFileSync(join(srcDir, `Button${i}.tsx`), source);
      const { exitCode } = await run(['--workspace', dir, '--json']);
      expect(exitCode).toBe(0);
      // Each new component is tiny, so slopIndex stays low and stable.
    }

    const { exitCode, stdout } = await run(['--workspace', dir, '--trend', '3']);
    expect(exitCode).toBe(0);
    expect(stdout).toMatch(/^Slop trend \(last \d+ runs\):/);
    expect(stdout).toMatch(/[▁▂▃▄▅▆▇█]+/);
  });

  it('reports no trend data when memory log is empty', async () => {
    const { exitCode, stdout } = await run(['--workspace', dir, '--trend']);
    expect(exitCode).toBe(0);
    expect(stdout).toContain('No trend data available.');
  });
});

describe('formatSparkline', () => {
  it('renders block characters scaled to min/max', () => {
    expect(formatSparkline([10, 20, 30, 40, 50])).toBe('▁▃▅▆█');
  });

  it('handles the all-equal case gracefully', () => {
    expect(formatSparkline([5, 5, 5])).toBe('▁▁▁');
  });

  it('returns an empty string for an empty list', () => {
    expect(formatSparkline([])).toBe('');
  });
});
