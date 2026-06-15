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

  it('exits with code 1 and reports issues when thresholds are exceeded', async () => {
    const { exitCode, stdout, stderr } = await run(['--workspace', dir]);
    expect(exitCode).toBe(1);
    const output = `${stdout}\n${stderr}`;
    expect(output).toContain('Slop thresholds exceeded.');
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
