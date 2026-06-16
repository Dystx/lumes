import { Command, InvalidArgumentError } from 'commander';
import { existsSync, writeFileSync, watch, statSync, type FSWatcher } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { performance } from 'node:perf_hooks';

import { loadConfig, DEFAULT_CONFIG } from './config';
import { discoverFiles } from './discover';
import { getGitHead, getGitRoot, getStagedFiles, getFilesSince } from './git';
import { installHook, uninstallHook } from './installer';
import { WorkerPool } from './engine/pool';
import {
  scoreFile,
  aggregateReport,
  resolveFrameworkMultiplier,
  SEVERITY_WEIGHTS,
} from './engine/metrics';
import {
  loadBaseline,
  saveBaseline,
  tightenBaseline,
  validateBaseline,
  hashConfig,
  baselinePath,
} from './engine/cache';
import { formatPretty } from './report/pretty';
import { formatJson } from './report/json';
import { formatSarif } from './report/sarif';
import { formatAdvice } from './report/advice';
import { buildHeatmap, formatHeatmap } from './report/heatmap';
import { applyFixes, type FixResult } from './fix';
import { readRuns, appendRun } from './engine/memory';
import {
  VERSION,
  type FileScanResult,
  type Issue,
  type ProjectReport,
  type ResolvedConfig,
  type BaselineMeta,
  type BaselineCache,
  type ComponentScore,
} from './types';

export * from './types';
export { loadConfig, DEFAULT_CONFIG } from './config';

export interface ScanProjectOptions {
  cwd: string;
  framework?: string;
  include?: string[];
  exclude?: string[];
  aiOnly?: boolean;
  humanOnly?: boolean;
  ignoreWcag22?: boolean;
  since?: string;
  staged?: boolean;
  threadCount?: number;
  tighten?: boolean;
  workerScript?: string;
  strict?: boolean;
  noIncrease?: boolean;
}

interface ScanRunOptions extends Omit<ScanProjectOptions, 'cwd'> {
  workspace?: string;
  fix?: boolean;
  doctor?: boolean;
  watch?: boolean;
  quiet?: boolean;
  trend?: number;
}

interface CliGlobalOptions extends ScanRunOptions {
  format?: 'pretty' | 'json' | 'sarif';
  json?: true | string;
  suggest?: boolean;
  heatmap?: boolean;
}

function parseThreads(value: string): number {
  const parsed = parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed <= 0) {
    throw new InvalidArgumentError('must be a positive integer');
  }
  return parsed;
}

function collectGlob(value: string, previous: string[] = []): string[] {
  return [...previous, value];
}

function parseTrend(value: string | undefined): number {
  if (value === undefined) return 20;
  const parsed = parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed <= 0) {
    throw new InvalidArgumentError('must be a positive integer');
  }
  return parsed;
}

function findConfigPath(cwd: string): string | undefined {
  const candidates = ['slop-audit.config.mjs', 'slop-audit.config.cjs', 'slop-audit.config.js'];
  let current = resolve(cwd);
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

export function colorForSlop(slopIndex: number): string {
  if (slopIndex >= 50) return 'red';
  if (slopIndex >= 25) return 'yellow';
  return 'green';
}

export function formatBadge(report: ProjectReport): string {
  const rounded = Math.round(report.slopIndex);
  const color = colorForSlop(report.slopIndex);
  return `[![Slop Index](https://img.shields.io/badge/slop--index-${rounded}-${color})](https://github.com/brickdotdev/slop-audit)`;
}

export function thresholdExceeded(report: ProjectReport, config: ResolvedConfig): boolean {
  return (
    report.slopIndex > config.thresholds.meanSlop ||
    report.p90Score > config.thresholds.p90Slop ||
    report.peakScore > config.thresholds.individualSlopThreshold
  );
}

export function formatSparkline(values: number[]): string {
  if (values.length === 0) return '';
  const min = Math.min(...values);
  const max = Math.max(...values);
  const blocks = '▁▂▃▄▅▆▇█';
  if (max === min) {
    return values.map(() => blocks[0]).join('');
  }
  return values
    .map((value) => {
      const ratio = (value - min) / (max - min);
      const index = Math.round(ratio * (blocks.length - 1));
      return blocks[Math.min(blocks.length - 1, index)];
    })
    .join('');
}

function renderTrend(runs: { slopIndex: number }[], count: number): string {
  const latest = runs.slice(-count);
  const values = latest.map((run) => run.slopIndex);
  const sparkline = formatSparkline(values);
  return `Slop trend (last ${latest.length} runs): ${values.map((v) => Math.round(v)).join(' ')} ${sparkline}`;
}

function stagedScoresThresholdExceeded(scores: ComponentScore[], config: ResolvedConfig): boolean {
  if (scores.length === 0) return false;
  const aggregated = aggregateReport(scores, [], config);
  const stagedReport: ProjectReport = {
    version: VERSION,
    generatedAt: new Date().toISOString(),
    slopIndex: aggregated.slopIndex,
    assemblyHealth: aggregated.assemblyHealth,
    categoryScores: aggregated.categoryScores,
    p90Score: aggregated.p90Score,
    peakScore: aggregated.peakScore,
    componentCount: aggregated.componentCount,
    components: aggregated.components,
    issues: [],
  };
  return thresholdExceeded(stagedReport, config);
}

export function filterIssues(
  issues: Issue[],
  options: Pick<ScanRunOptions, 'aiOnly' | 'humanOnly' | 'ignoreWcag22'>,
): Issue[] {
  let result = issues;
  if (options.aiOnly) {
    result = result.filter((issue) => issue.aiSpecific);
  }
  if (options.humanOnly) {
    result = result.filter((issue) => !issue.aiSpecific);
  }
  if (options.ignoreWcag22) {
    result = result.filter((issue) => issue.category !== 'wcag');
  }
  return result;
}

function intersectFiles(discovered: string[], gitPaths: string[], cwd: string): string[] {
  if (gitPaths.length === 0) return [];
  const gitAbs = new Set(gitPaths.map((p) => resolve(cwd, p)));
  return discovered.filter((file) => gitAbs.has(file));
}

function serializeValue(value: unknown, indent = 0): string {
  const currentIndent = ' '.repeat(indent);
  const nextIndent = ' '.repeat(indent + 2);

  if (value instanceof RegExp) {
    return `new RegExp(${JSON.stringify(value.source)}, ${JSON.stringify(value.flags)})`;
  }
  if (value === null) return 'null';
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    const items = value.map((item) => serializeValue(item, indent + 2)).join(`,\n${nextIndent}`);
    return `[\n${nextIndent}${items},\n${currentIndent}]`;
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0) return '{}';
    const items = entries
      .map(([key, val]) => `${JSON.stringify(key)}: ${serializeValue(val, indent + 2)}`)
      .join(`,\n${nextIndent}`);
    return `{\n${nextIndent}${items},\n${currentIndent}}`;
  }
  return JSON.stringify(value);
}

export function serializeConfig(config: ResolvedConfig): string {
  return `export default ${serializeValue(config, 0)};\n`;
}

function buildBaselineCache(
  report: ProjectReport,
  configHash: string,
  gitHead: string,
): BaselineCache {
  const scores: BaselineCache['scores'] = {};
  for (const component of report.components) {
    scores[component.filePath] = {
      baselineScore: component.adjustedScore,
      componentCount: component.componentCount,
    };
  }
  return {
    version: VERSION,
    config_hash: configHash,
    git_head: gitHead,
    baseline_created: new Date().toISOString(),
    baseline_revision: 1,
    totalComponentCount: report.componentCount,
    scores,
  };
}

interface ScanRunResult {
  report: ProjectReport;
  scores: ComponentScore[];
  config: ResolvedConfig;
  noIncreaseFailure: boolean;
}

async function runScan(
  options: ScanRunOptions,
  explicitPaths?: string[],
): Promise<ScanRunResult> {
  const cwd = resolve(options.workspace ?? process.cwd());
  const loadedConfig = await loadConfig(cwd);
  const config: ResolvedConfig = { ...loadedConfig };
  if (options.framework) {
    config.framework = options.framework;
  }
  if (options.include && options.include.length > 0) {
    config.include = options.include;
  }
  if (options.exclude && options.exclude.length > 0) {
    config.exclude = [...config.exclude, ...options.exclude];
  }

  if (options.doctor) {
    console.warn('Warning: --doctor is not implemented');
  }

  let files: string[];
  if (explicitPaths && explicitPaths.length > 0) {
    files = explicitPaths.map((p) => resolve(cwd, p));
  } else {
    files = await discoverFiles(cwd, config);
  }

  if (options.staged) {
    const staged = await getStagedFiles(cwd);
    files = intersectFiles(files, staged, cwd);
  }
  if (options.since) {
    const since = await getFilesSince(cwd, options.since);
    files = intersectFiles(files, since, cwd);
  }

  const configHash = hashConfig(config);
  const gitHead = (await getGitHead(cwd)) ?? 'unknown';
  let baseline: BaselineCache | undefined;
  let baselineMeta: BaselineMeta | undefined;
  const baselineCache = loadBaseline(cwd);

  if (baselineCache) {
    const validation = validateBaseline(baselineCache, configHash, gitHead);
    if (validation.valid) {
      baseline = options.tighten ? tightenBaseline(baselineCache) : baselineCache;
      baselineMeta = {
        active: true,
        version: baseline.version,
        baselineRevision: baseline.baseline_revision,
        createdAt: baseline.baseline_created,
      };
    } else if (!options.quiet) {
      console.warn(`Baseline invalid: ${validation.reason}; ignoring.`);
    }
  }

  const pool = new WorkerPool({
    config,
    threadCount: options.threadCount,
    ...(options.workerScript ? { workerScript: options.workerScript } : {}),
  });
  const results = await pool.scan(files);

  for (const result of results) {
    result.issues = filterIssues(result.issues, options);
    for (const issue of result.issues) {
      if (issue.filePath === undefined) {
        issue.filePath = result.filePath;
      }
    }
  }

  const multiplier = resolveFrameworkMultiplier(config);
  const scores = results.map((result) => scoreFile(result, multiplier, config, baseline));
  const issueGroups = results.map((result) => ({
    filePath: result.filePath,
    issues: result.issues,
  }));

  const aggregated = aggregateReport(scores, issueGroups, config);

  const allIssues = results.flatMap((result) => result.issues);
  allIssues.sort((a, b) => SEVERITY_WEIGHTS[b.severity] - SEVERITY_WEIGHTS[a.severity]);

  const configPath = findConfigPath(cwd);

  const report: ProjectReport = {
    version: VERSION,
    generatedAt: new Date().toISOString(),
    configPath,
    slopIndex: aggregated.slopIndex,
    assemblyHealth: aggregated.assemblyHealth,
    categoryScores: aggregated.categoryScores,
    p90Score: aggregated.p90Score,
    peakScore: aggregated.peakScore,
    componentCount: aggregated.componentCount,
    components: aggregated.components,
    issues: allIssues,
    baseline: baselineMeta,
  };

  let noIncreaseFailure = false;
  if (options.noIncrease) {
    const previous = readRuns(cwd).at(-1);
    if (previous) {
      if (report.slopIndex > previous.slopIndex) {
        noIncreaseFailure = true;
        if (!options.quiet) {
          console.error(
            `Slop index increased from ${previous.slopIndex.toFixed(1)} to ${report.slopIndex.toFixed(1)}.`,
          );
        }
      }
    } else if (!options.quiet) {
      console.warn('Warning: no previous run found; --no-increase has nothing to compare.');
    }
  }

  if (config.projectMemory !== false) {
    appendRun(cwd, report, thresholdExceeded(report, config));
  }

  return { report, scores, config, noIncreaseFailure };
}

export async function scanProject(options: ScanProjectOptions): Promise<ProjectReport> {
  const { report } = await runScan({ ...options, workspace: options.cwd });
  return report;
}

function printFixSummary(
  results: FixResult[],
  quiet: boolean,
): { totalApplied: number; totalSkipped: number; hasErrors: boolean } {
  let totalApplied = 0;
  let totalSkipped = 0;
  let hasErrors = false;

  for (const result of results) {
    totalApplied += result.applied.length;
    totalSkipped += result.skipped.length;
    if (result.errors && result.errors.length > 0) {
      hasErrors = true;
    }

    if (quiet) continue;

    const entries: string[] = [];
    for (const app of result.applied) {
      entries.push(`  [applied] ${app.ruleId}: ${app.description}`);
    }
    for (const app of result.skipped) {
      entries.push(`  [skipped] ${app.ruleId}: ${app.description}`);
    }
    for (const err of result.errors ?? []) {
      entries.push(`  [error] ${err}`);
    }

    if (entries.length > 0) {
      console.log(result.filePath);
      for (const entry of entries) {
        console.log(entry);
      }
    }
  }

  if (!quiet) {
    console.log(`Fixes applied: ${totalApplied}, skipped: ${totalSkipped}${hasErrors ? ', errors detected' : ''}`);
  }

  return { totalApplied, totalSkipped, hasErrors };
}

function renderOutput(report: ProjectReport, options: CliGlobalOptions): void {
  if (options.suggest) {
    if (!options.quiet) {
      console.log(formatAdvice(report));
    }
    return;
  }

  if (options.json) {
    const json = formatJson(report);
    if (typeof options.json === 'string') {
      writeFileSync(resolve(options.json), json);
      if (!options.quiet) {
        console.error(`Wrote JSON report to ${options.json}`);
      }
    } else {
      console.log(json);
    }
    return;
  }

  if (options.format === 'json') {
    console.log(formatJson(report));
    return;
  }

  if (options.format === 'sarif') {
    const cwd = resolve(options.workspace ?? process.cwd());
    console.log(formatSarif(report, { cwd }));
    return;
  }

  if (!options.quiet) {
    console.log(formatPretty(report));
  }
}

async function outputScanResults(report: ProjectReport, options: CliGlobalOptions, cwd: string): Promise<void> {
  if (options.heatmap) {
    const entries = await buildHeatmap(report, cwd);
    console.log(formatHeatmap(entries, { json: options.format === 'json' }));
    return;
  }
  renderOutput(report, options);
}

async function watchProject(options: CliGlobalOptions, cwd: string, paths: string[]): Promise<void> {
  let baselineMtime: number | undefined;
  let configPath = findConfigPath(cwd);
  let debounceTimer: ReturnType<typeof setTimeout> | undefined;
  let closed = false;
  let watcher: FSWatcher | undefined;

  function getBaselineMtime(): number | undefined {
    try {
      return statSync(baselinePath(cwd)).mtimeMs;
    } catch {
      return undefined;
    }
  }

  process.once('SIGINT', () => {
    if (closed) return;
    closed = true;
    if (debounceTimer) clearTimeout(debounceTimer);
    if (watcher) watcher.close();
    process.exit(0);
  });

  async function doScan(configChanged: boolean): Promise<void> {
    if (closed) return;

    const currentBaselineMtime = getBaselineMtime();
    const baselineChanged = currentBaselineMtime !== baselineMtime;
    baselineMtime = currentBaselineMtime;

    if (configChanged) {
      configPath = findConfigPath(cwd);
    }

    try {
      const { report } = await runScan(options, paths);
      await outputScanResults(report, options, cwd);

      if (!options.quiet) {
        if (configChanged) {
          console.error('Config changed; reloaded.');
        } else if (baselineChanged) {
          console.error('Baseline changed; reloaded.');
        }
        console.error('Watching for changes... (press Ctrl+C to stop)');
      }
    } catch (err) {
      console.error('Scan failed:', err instanceof Error ? err.message : String(err));
    }
  }

  baselineMtime = getBaselineMtime();
  await doScan(false);

  if (closed) return;

  watcher = watch(
    cwd,
    { recursive: true },
    (_eventType, filename) => {
      if (closed || !filename) return;

      const changedPath = resolve(cwd, filename.toString());

      // Ignore changes to the baseline cache itself to avoid feedback loops.
      if (changedPath === baselinePath(cwd)) return;

      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        debounceTimer = undefined;
        const configChanged = configPath !== undefined && changedPath === configPath;
        void doScan(configChanged);
      }, 100);
    },
  );
}

export async function runCli({ start }: { start: number }): Promise<void> {
  try {
    const program = new Command()
      .name('slop-audit')
      .description('Detect AI-generated frontend slop')
      .version(VERSION)
      .option('--framework <name>', 'framework multiplier to apply')
      .option('--include <glob>', 'include pattern (repeatable)', collectGlob, [])
      .option('--exclude <glob>', 'exclude pattern (repeatable)', collectGlob, [])
      .option('--ai-only', 'only report AI-specific issues')
      .option('--human-only', 'only report human-facing issues')
      .option('--ignore-wcag22', 'ignore WCAG 2.2 related issues')
      .option('--format <pretty|json|sarif>', 'output format', 'pretty')
      .option('--threads <n>', 'number of worker threads', parseThreads)
      .option('--since <ref>', 'only scan files changed since git ref')
      .option('--workspace <path>', 'workspace/project path', process.cwd())
      .option('--tighten', 'tighten baseline allowances')
      .option('--fix', 'apply auto-fixes')
      .option('--doctor', 'run diagnostics (not implemented)')
      .option('--watch', 'watch files and re-run')
      .option('--suggest', 'print remediation advice')
      .option('--heatmap', 'print migration ROI heatmap')
      .option('--quiet', 'suppress non-error output')
      .option('--strict', 'exit 2 if any high-severity issue remains')
      .option('--no-increase', 'exit 2 if slop index increased since last run')
      .option('--trend [n]', 'print a sparkline of the last n runs', parseTrend)
      .option('--json [path]', 'write JSON report to path or stdout')
      .option('--staged', 'scan only staged files');

    program
      .command('init')
      .description('create a slop-audit config file')
      .option('--baseline', 'run an initial scan and save a baseline')
      .option('--yes', 'overwrite existing config')
      .action(async (cmdOptions: { baseline?: boolean; yes?: boolean }, command: Command) => {
        const options = command.optsWithGlobals() as CliGlobalOptions;
        const cwd = resolve(options.workspace ?? process.cwd());
        const configPath = join(cwd, 'slop-audit.config.mjs');
        if (existsSync(configPath) && !cmdOptions.yes) {
          console.error(`Config file already exists: ${configPath}`);
          console.error('Use --yes to overwrite');
          process.exit(2);
        }
        writeFileSync(configPath, serializeConfig(DEFAULT_CONFIG));
        if (!options.quiet) {
          console.log(`Created ${configPath}`);
        }
        if (cmdOptions.baseline) {
          const { report, config } = await runScan({ ...options, workspace: cwd });
          const configHash = hashConfig(config);
          const gitHead = (await getGitHead(cwd)) ?? 'unknown';
          const cache = buildBaselineCache(report, configHash, gitHead);
          saveBaseline(cwd, cache);
          if (!options.quiet) {
            console.log(`Saved baseline to ${baselinePath(cwd)}`);
          }
        }
        process.exit(0);
      });

    program
      .command('install')
      .description('install the git pre-commit hook')
      .action(async (_cmdOptions: Record<string, unknown>, command: Command) => {
        const options = command.optsWithGlobals() as CliGlobalOptions;
        const cwd = resolve(options.workspace ?? process.cwd());
        const root = getGitRoot(cwd);
        if (!root) {
          console.error('Not a git repository');
          process.exit(2);
        }
        const result = installHook(root);
        if (!options.quiet) {
          console.log(result.message);
        }
        process.exit(result.exitCode);
      });

    program
      .command('uninstall')
      .description('uninstall the git pre-commit hook')
      .action(async (_cmdOptions: Record<string, unknown>, command: Command) => {
        const options = command.optsWithGlobals() as CliGlobalOptions;
        const cwd = resolve(options.workspace ?? process.cwd());
        const root = getGitRoot(cwd);
        if (!root) {
          console.error('Not a git repository');
          process.exit(2);
        }
        const result = uninstallHook(root);
        if (!options.quiet) {
          console.log(result.message);
        }
        process.exit(result.exitCode);
      });

    program
      .command('badge')
      .description('print a shields.io slop-index badge')
      .action(async (_cmdOptions: Record<string, unknown>, command: Command) => {
        const options = command.optsWithGlobals() as CliGlobalOptions;
        const { report } = await runScan(options);
        console.log(formatBadge(report));
        process.exit(0);
      });

    program
      .command('suggest')
      .description('print remediation advice')
      .action(async (_cmdOptions: Record<string, unknown>, command: Command) => {
        const options = command.optsWithGlobals() as CliGlobalOptions;
        const { report } = await runScan(options);
        console.log(formatAdvice(report));
        process.exit(0);
      });

    const scanAction = async (
      paths: string[],
      _options: CliGlobalOptions,
      command: Command,
    ): Promise<void> => {
      const rawGlobals = command.optsWithGlobals() as CliGlobalOptions & { increase?: boolean };
      const options: CliGlobalOptions = {
        ...rawGlobals,
        noIncrease: rawGlobals.increase === false,
      };

      if (options.heatmap && options.suggest) {
        console.error('Error: --heatmap cannot be used with --suggest');
        process.exit(2);
      }

      const cwd = resolve(options.workspace ?? process.cwd());

      if (options.trend !== undefined) {
        const runs = readRuns(cwd);
        if (runs.length === 0) {
          console.log('No trend data available.');
        } else {
          console.log(renderTrend(runs, options.trend));
        }
        process.exit(0);
      }

      if (options.watch) {
        await watchProject(options, cwd, paths);
        return;
      }

      const scanStart = performance.now();
      const { report, scores, config, noIncreaseFailure } = await runScan(options, paths);
      const scanElapsed = Math.round(performance.now() - scanStart);
      const totalElapsed = Math.round(performance.now() - start);

      if (options.fix) {
        const fixResults = await applyFixes(report, config);
        const { totalApplied, totalSkipped, hasErrors } = printFixSummary(fixResults, options.quiet ?? false);

        if (!options.quiet) {
          console.error(`(scan took ${scanElapsed}ms, total ${totalElapsed}ms)`);
        }

        process.exit(hasErrors ? 1 : 0);
      }

      if (options.heatmap) {
        const entries = await buildHeatmap(report, cwd);
        console.log(formatHeatmap(entries, { json: options.format === 'json' }));
        if (!options.quiet) {
          console.error(`(scan took ${scanElapsed}ms, total ${totalElapsed}ms)`);
        }
        process.exit(0);
      }

      renderOutput(report, options);

      let exitCode: 0 | 1 | 2 = thresholdExceeded(report, config) ? 1 : 0;
      if (options.staged && stagedScoresThresholdExceeded(scores, config)) {
        exitCode = 1;
      }
      if (options.strict && report.issues.some((issue) => issue.severity === 'high')) {
        exitCode = 2;
        if (!options.quiet) {
          console.error('High-severity issues found with --strict.');
        }
      }
      if (noIncreaseFailure) {
        exitCode = 2;
      }

      if (exitCode === 1) {
        if (options.staged) {
          console.error('Gating failure: staged file(s) exceed slop threshold.');
        } else {
          console.error('Slop thresholds exceeded.');
        }
      }
      if (!options.quiet) {
        console.error(`(scan took ${scanElapsed}ms, total ${totalElapsed}ms)`);
      }
      process.exit(exitCode);
    };

    program
      .command('scan [paths...]', { isDefault: true })
      .description('scan files for slop')
      .action(scanAction);

    await program.parseAsync(process.argv);
  } catch (err) {
    console.error('Unexpected error:', err instanceof Error ? err.message : String(err));
    process.exit(3);
  }
}
