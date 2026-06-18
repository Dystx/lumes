import { describe, expect, it, beforeAll, beforeEach, afterEach } from 'vitest';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { ProjectReport } from '../../src/types';
import {
  assertDistBuilt,
  cleanupTempDir,
  createTmpDir,
  execFileAsync,
  run,
} from '../helpers/cli';

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

function writeGitRepo(dir: string): void {
  mkdirSync(join(dir, 'src'), { recursive: true });
  writeFileSync(join(dir, 'src', 'Button.tsx'), 'export function Button() { return <button>hi</button>; }');
}

beforeAll(assertDistBuilt);

describe('init command', () => {
  let dir: string;

  beforeEach(() => {
    dir = createTmpDir();
  });

  afterEach(() => {
    cleanupTempDir(dir);
  });

  it('creates slop-audit.config.mjs with --yes', async () => {
    const { exitCode, stdout } = await run(['init', '--yes', '--workspace', dir]);
    expect(exitCode).toBe(0);
    const configPath = join(dir, 'slop-audit.config.mjs');
    expect(existsSync(configPath)).toBe(true);
    const content = readFileSync(configPath, 'utf8');
    expect(content).toContain('export default');
    expect(content).toContain('"thresholds"');
    expect(stdout).toContain(`Created ${configPath}`);
  });

  it('creates config and baseline with --yes --baseline', async () => {
    writeGitRepo(dir);
    await execFileAsync('git', ['init'], { cwd: dir });

    const { exitCode } = await run(['init', '--yes', '--baseline', '--workspace', dir]);
    expect(exitCode).toBe(0);
    expect(existsSync(join(dir, 'slop-audit.config.mjs'))).toBe(true);

    const baselineFile = join(dir, '.slop-audit', 'cache', 'baseline.json');
    expect(existsSync(baselineFile)).toBe(true);
    const baseline = JSON.parse(readFileSync(baselineFile, 'utf8')) as Record<string, unknown>;
    expect(baseline.version).toBe('1.0.0');
    expect(typeof baseline.config_hash).toBe('string');
    expect(typeof baseline.git_head).toBe('string');
  });
});

describe('baseline lifecycle', () => {
  let dir: string;

  beforeEach(() => {
    dir = createTmpDir();
  });

  afterEach(() => {
    cleanupTempDir(dir);
  });

  it('persists --tighten to the baseline cache', async () => {
    writeGitRepo(dir);
    await execFileAsync('git', ['init'], { cwd: dir });

    const init = await run(['init', '--yes', '--baseline', '--workspace', dir]);
    expect(init.exitCode).toBe(0);

    const baselineFile = join(dir, '.slop-audit', 'cache', 'baseline.json');
    const before = JSON.parse(readFileSync(baselineFile, 'utf8')) as {
      baseline_revision: number;
      scores: Record<string, { baselineScore: number }>;
    };

    const tighten = await run(['--workspace', dir, '--tighten', '--json']);
    expect(tighten.exitCode).toBe(0);

    const after = JSON.parse(readFileSync(baselineFile, 'utf8')) as {
      baseline_revision: number;
      scores: Record<string, { baselineScore: number }>;
    };
    expect(after.baseline_revision).toBe(before.baseline_revision + 1);
    for (const file of Object.keys(before.scores)) {
      const previous = before.scores[file].baselineScore;
      const next = after.scores[file].baselineScore;
      expect(next).toBeCloseTo(previous * 0.9, 2);
    }
  });
});

describe('git hook commands', () => {
  let dir: string;

  beforeEach(async () => {
    dir = createTmpDir();
    writeGitRepo(dir);
    await execFileAsync('git', ['init'], { cwd: dir });
  });

  afterEach(() => {
    cleanupTempDir(dir);
  });

  it('installs and uninstalls the pre-commit hook', async () => {
    const hookPath = join(dir, '.git', 'hooks', 'pre-commit');

    const install = await run(['install', '--workspace', dir]);
    expect(install.exitCode).toBe(0);
    expect(existsSync(hookPath)).toBe(true);
    const installed = readFileSync(hookPath, 'utf8');
    expect(installed).toContain('# slop-audit-hook-begin');
    expect(installed).toContain('npx slop-audit --staged');
    expect(installed).toContain('# slop-audit-hook-end');

    const uninstall = await run(['uninstall', '--workspace', dir]);
    expect(uninstall.exitCode).toBe(0);
    const uninstalled = readFileSync(hookPath, 'utf8');
    expect(uninstalled).not.toContain('# slop-audit-hook-begin');
    expect(uninstalled).not.toContain('# slop-audit-hook-end');
  });

  it('does not duplicate the hook block when install is run twice', async () => {
    const hookPath = join(dir, '.git', 'hooks', 'pre-commit');

    const first = await run(['install', '--workspace', dir]);
    expect(first.exitCode).toBe(0);

    const second = await run(['install', '--workspace', dir]);
    expect(second.exitCode).toBe(0);

    const content = readFileSync(hookPath, 'utf8');
    const beginCount = content.split('\n').filter((line) => line === '# slop-audit-hook-begin').length;
    expect(beginCount).toBe(1);
  });

  it('uninstall is idempotent on an already-uninstalled hook', async () => {
    const hookPath = join(dir, '.git', 'hooks', 'pre-commit');

    await run(['install', '--workspace', dir]);
    const firstUninstall = await run(['uninstall', '--workspace', dir]);
    expect(firstUninstall.exitCode).toBe(0);

    const secondUninstall = await run(['uninstall', '--workspace', dir]);
    expect(secondUninstall.exitCode).toBe(0);

    const content = readFileSync(hookPath, 'utf8');
    expect(content).not.toContain('# slop-audit-hook-begin');
    expect(content).not.toContain('# slop-audit-hook-end');
  });
});

describe('scan-based commands', () => {
  let dir: string;

  beforeEach(() => {
    dir = createTmpDir();
    writeSloppyProject(dir);
  });

  afterEach(() => {
    cleanupTempDir(dir);
  });

  it('prints a shields.io badge containing slop--index', async () => {
    const { exitCode, stdout } = await run(['badge', '--workspace', dir]);
    expect(exitCode).toBe(0);
    expect(stdout).toContain('slop--index');
    expect(stdout).toContain('https://img.shields.io/badge/slop--index-');
  });

  it('prints remediation advice for sloppy projects', async () => {
    const { exitCode, stdout } = await run(['suggest', '--workspace', dir]);
    expect(exitCode).toBe(0);
    expect(stdout).toContain('Remediation advice');
  });

  it('suppresses non-error output with --quiet', async () => {
    const { exitCode, stdout, stderr } = await run(['--workspace', dir, '--quiet']);
    expect(exitCode).toBe(1);
    expect(stdout).toBe('');
    expect(stderr).not.toContain('scan took');
    expect(stderr).not.toContain('Slop Index');
  });

  it('exits with code 1 and reports issues when thresholds are exceeded', async () => {
    const { exitCode, stdout, stderr } = await run(['--workspace', dir]);
    expect(exitCode).toBe(1);
    const output = `${stdout}\n${stderr}`;
    expect(output).toMatch(/\d+ thresholds? failed\. See details above\./);
    // Assert on stable category labels and issue presence rather than exact rule IDs.
    expect(output).toContain('Accessibility');
    expect(output).toMatch(/Issues \(\d+\)/);
  });

  it('outputs valid JSON with a slopIndex number using --format json', async () => {
    const { exitCode, stdout } = await run(['--workspace', dir, '--format', 'json']);
    const report = JSON.parse(stdout) as ProjectReport;
    expect(typeof report.slopIndex).toBe('number');
    expect(report.issues.length).toBeGreaterThan(0);
    expect(exitCode).toBe(1);
  });

  it('renders only AI-specific issues with --ai-only', async () => {
    const unfiltered = await run(['--workspace', dir, '--format', 'json']);
    const unfilteredReport = JSON.parse(unfiltered.stdout) as ProjectReport;

    const { exitCode, stdout } = await run(['--workspace', dir, '--format', 'json', '--ai-only']);
    const report = JSON.parse(stdout) as ProjectReport;
    expect(report.issues.length).toBeGreaterThan(0);
    expect(report.issues.every((issue) => issue.aiSpecific)).toBe(true);
    expect(report.issues.some((issue) => issue.category === 'wcag')).toBe(false);
    expect(report.categoryScores.wcag).toBe(0);
    expect(report.slopIndex).toBeLessThan(unfilteredReport.slopIndex);
    expect(exitCode).toBe(0);
  });

  it('outputs valid SARIF v2.1.0 JSON with --format sarif', async () => {
    const { exitCode, stdout } = await run(['--workspace', dir, '--format', 'sarif']);
    expect(exitCode).toBe(1);
    const parsed = JSON.parse(stdout) as {
      $schema: string;
      version: string;
      runs: Array<{
        tool: { driver: { name: string; version: string; rules: unknown[] } };
        results: unknown[];
      }>;
    };
    expect(parsed.$schema).toBe('https://json.schemastore.org/sarif-2.1.0.json');
    expect(parsed.version).toBe('2.1.0');
    expect(parsed.runs).toHaveLength(1);
    expect(parsed.runs[0].tool.driver.name).toBe('slop-audit');
    expect(parsed.runs[0].tool.driver.version).toBe('1.0.0');
    expect(parsed.runs[0].results.length).toBeGreaterThan(0);
    expect(parsed.runs[0].tool.driver.rules.length).toBeGreaterThan(0);
  });

  it('prints a migration ROI heatmap with --heatmap', async () => {
    const { exitCode, stdout } = await run(['--workspace', dir, '--heatmap']);
    expect(exitCode).toBe(0);
    expect(stdout).toContain('ROI');
    expect(stdout).toContain('Score');
    expect(stdout).toContain('Recency');
    expect(stdout).toContain('Churn');
    expect(stdout).toContain('File');
    expect(stdout).toContain('src/AiSlop.tsx');
  });

  it('prints heatmap as JSON with --heatmap --format json', async () => {
    const { exitCode, stdout } = await run(['--workspace', dir, '--heatmap', '--format', 'json']);
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout) as Array<{ filePath: string; roi: number }>;
    expect(parsed.length).toBeGreaterThan(0);
    expect(parsed[0].filePath).toMatch(/src\/.+\.tsx$/);
    expect(typeof parsed[0].roi).toBe('number');
  });
});

function writeUseClientFixture(dir: string): void {
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

function writeLayoutArbitraryFixture(dir: string): void {
  const srcDir = join(dir, 'src');
  mkdirSync(srcDir, { recursive: true });
  writeFileSync(
    join(srcDir, 'LayoutArbitrary.tsx'),
    `export function LayoutArbitrary() {
  return <div className="p-[13px] m-[20px] w-[100px]" />;
}
`,
  );
}

function writeFocusRingFixture(dir: string): void {
  const srcDir = join(dir, 'src');
  mkdirSync(srcDir, { recursive: true });
  writeFileSync(
    join(srcDir, 'FocusRing.tsx'),
    `export function FocusRing() {
  return <button className="outline-none">click</button>;
}
`,
  );
  writeFileSync(join(dir, 'globals.css'), 'body { margin: 0; }\n');
  writeFileSync(
    join(dir, 'slop-audit.config.mjs'),
    `export default {
  globalCssTarget: '${join(dir, 'globals.css').replace(/\\/g, '\\\\')}',
};
`,
  );
}

describe('--fix flag', () => {
  let dir: string;

  beforeEach(() => {
    dir = createTmpDir();
  });

  afterEach(() => {
    cleanupTempDir(dir);
  });

  it('inserts "use client" for server-component hook violations', async () => {
    writeUseClientFixture(dir);
    const { exitCode, stdout } = await run(['--workspace', dir, '--fix']);
    expect(exitCode).toBe(0);
    expect(stdout).toContain('Fixes applied: 1');
    const content = readFileSync(join(dir, 'src', 'ServerHook.tsx'), 'utf8');
    expect(content.startsWith('"use client";')).toBe(true);
  });

  it('replaces layout arbitrary values with nearest Tailwind tokens', async () => {
    writeLayoutArbitraryFixture(dir);
    const { exitCode, stdout } = await run(['--workspace', dir, '--fix']);
    expect(exitCode).toBe(0);
    expect(stdout).toContain('Fixes applied:');
    const content = readFileSync(join(dir, 'src', 'LayoutArbitrary.tsx'), 'utf8');
    expect(content).toContain('className="p-3 m-5 w-25"');
  });

  it('injects a versioned focus-ring CSS anchor into globalCssTarget', async () => {
    writeFocusRingFixture(dir);
    const { exitCode, stdout } = await run(['--workspace', dir, '--fix']);
    expect(exitCode).toBe(0);
    expect(stdout).toContain('Fixes applied:');
    const css = readFileSync(join(dir, 'globals.css'), 'utf8');
    expect(css).toContain('@slop-audit:v1.0.0:fix:focus-ring');
    expect(css).toContain(':focus-visible');
  });

  it('is idempotent when run twice', async () => {
    writeUseClientFixture(dir);
    const first = await run(['--workspace', dir, '--fix']);
    expect(first.exitCode).toBe(0);
    expect(first.stdout).toContain('Fixes applied: 1');

    const second = await run(['--workspace', dir, '--fix']);
    expect(second.exitCode).toBe(0);
    expect(second.stdout).toContain('Fixes applied: 0');

    const content = readFileSync(join(dir, 'src', 'ServerHook.tsx'), 'utf8');
    expect(content.match(/"use client";/g)).toHaveLength(1);
  });
});

describe('default scan subcommand', () => {
  let dir: string;

  beforeEach(() => {
    dir = createTmpDir();
    mkdirSync(join(dir, 'src'), { recursive: true });
    writeFileSync(join(dir, 'src', 'Button.tsx'), 'export function Button() { return <div>hi</div>; }');
  });

  afterEach(() => {
    cleanupTempDir(dir);
  });

  it('accepts an explicit scan subcommand', async () => {
    const { exitCode, stdout } = await run(['scan', '--workspace', dir, '--json']);
    expect(exitCode).toBe(0);
    const report = JSON.parse(stdout) as ProjectReport;
    expect(report.components.length).toBeGreaterThan(0);
  });

  it('works as the default command without the scan keyword', async () => {
    const { exitCode, stdout } = await run(['--workspace', dir, '--json']);
    expect(exitCode).toBe(0);
    const report = JSON.parse(stdout) as ProjectReport;
    expect(report.components.length).toBeGreaterThan(0);
  });
});

describe('doctor command', () => {
  let dir: string;

  beforeEach(() => {
    dir = createTmpDir();
  });

  afterEach(() => {
    cleanupTempDir(dir);
  });

  it('exits 0 when parser bindings are functional', async () => {
    const { exitCode, stdout } = await run(['--doctor', '--workspace', dir]);
    expect(exitCode).toBe(0);
    expect(stdout).toContain('Platform:');
    expect(stdout).toContain('Parser bindings are functional.');
  });
});
