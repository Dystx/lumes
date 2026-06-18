import { Command, InvalidArgumentError } from 'commander';
import { existsSync, writeFileSync, readFileSync, watch, statSync, rmSync, mkdirSync, type FSWatcher } from 'node:fs';
import { resolve, join, dirname, relative } from 'node:path';
import { performance } from 'node:perf_hooks';

import { loadConfig, DEFAULT_CONFIG, detectStack, detectMonorepoRoot } from './config';
import { discoverFiles } from './discover';
import { getGitHead, getGitRoot, getStagedFiles, getFilesSince } from './git';
import { installHook, uninstallHook } from './installer';
import { WorkerPool } from './engine/pool';
import { scanFile } from './engine/worker';
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
import { formatUnifiedDiff } from './report/unified-diff';
import { buildHeatmap, formatHeatmap } from './report/heatmap';
import { applyFixes, type FixResult } from './fix';
import { readRuns, appendRun } from './engine/memory';
import { recordTelemetry, readTelemetry } from './engine/telemetry';
import { formatFlywheel, summarizeTelemetry } from './report/flywheel';
import { logger, setLoggerQuiet } from './engine/logger';
import { runProjectRules } from './rules/project';
import {
  refreshRegistrySnapshot,
  copyBundledSnapshotToCache,
  isRegistryFresh,
  BUNDLED_REGISTRY_VERSION,
} from './rules/registry-loader';
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
  cache?: boolean;
}

interface ScanRunOptions extends Omit<ScanProjectOptions, 'cwd'> {
  workspace?: string;
  fix?: boolean;
  doctor?: boolean;
  watch?: boolean;
  quiet?: boolean;
  trend?: number;
  cache?: boolean;
  baseline?: boolean;
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
  if (slopIndex >= 76) return 'red';
  if (slopIndex >= 51) return 'orange';
  if (slopIndex >= 26) return 'yellow';
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

function failedThresholdCount(report: ProjectReport, config: ResolvedConfig): number {
  let count = 0;
  if (report.slopIndex > config.thresholds.meanSlop) count += 1;
  if (report.p90Score > config.thresholds.p90Slop) count += 1;
  if (report.peakScore > config.thresholds.individualSlopThreshold) count += 1;
  return count;
}

function baselineStatusMessage(baseline: BaselineMeta): string {
  const date = new Date(baseline.createdAt).toLocaleString();
  return `Baseline active since ${date} (Revision ${baseline.baselineRevision}). Run \`slop-audit --tighten\` to reduce baseline forgiveness by 10%.`;
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

interface StagedGatingResult {
  failed: boolean;
  reason?: string;
}

function checkIndividualThreshold(scores: ComponentScore[], threshold: number): StagedGatingResult {
  for (const score of scores) {
    if (score.adjustedScore > threshold) {
      return {
        failed: true,
        reason: `Staged file ${score.filePath} exceeds individual threshold (${score.adjustedScore.toFixed(1)} > ${threshold}).`,
      };
    }
  }
  return { failed: false };
}

export function stagedGating(
  scores: ComponentScore[],
  config: ResolvedConfig,
  baseline: BaselineCache | undefined,
  cwd: string,
): StagedGatingResult {
  if (scores.length === 0) return { failed: false };

  const individualThreshold = config.thresholds.individualSlopThreshold;

  // On cache mismatch/missing, degrade to strict individual file gating.
  if (!baseline) {
    return checkIndividualThreshold(scores, individualThreshold);
  }

  for (const score of scores) {
    const relPath = relative(cwd, score.filePath);
    const isNewFile = !baseline.scores[relPath];
    if (isNewFile && score.adjustedScore > individualThreshold) {
      return {
        failed: true,
        reason: `New staged file ${relPath} exceeds individual threshold (${score.adjustedScore.toFixed(1)} > ${individualThreshold}).`,
      };
    }
  }

  const stagedPaths = new Set(scores.map((s) => relative(cwd, s.filePath)));
  const cachedTotal = baseline.totalComponentCount;
  let newStagedComponentCount = 0;
  let deletedStagedComponentCount = 0;
  let modifiedDiff = 0;

  for (const score of scores) {
    const cached = baseline.scores[relative(cwd, score.filePath)];
    if (cached) {
      modifiedDiff += score.componentCount - cached.componentCount;
    } else {
      newStagedComponentCount += score.componentCount;
    }
  }

  for (const [filePath, cached] of Object.entries(baseline.scores)) {
    if (stagedPaths.has(filePath)) continue;
    if (!existsSync(filePath) && !existsSync(resolve(cwd, filePath))) {
      deletedStagedComponentCount += cached.componentCount;
    }
  }

  const virtualN = cachedTotal + newStagedComponentCount - deletedStagedComponentCount + modifiedDiff;
  if (virtualN <= 0) {
    return checkIndividualThreshold(scores, individualThreshold);
  }

  let sumAllCachedAdjustedScores = 0;
  for (const cached of Object.values(baseline.scores)) {
    sumAllCachedAdjustedScores += cached.baselineScore;
  }

  let sumCachedStagedScores = 0;
  let sumNewStagedScores = 0;
  for (const score of scores) {
    const cached = baseline.scores[relative(cwd, score.filePath)];
    if (cached) {
      sumCachedStagedScores += cached.baselineScore;
    }
    sumNewStagedScores += score.adjustedScore;
  }

  const hypotheticalMean =
    (sumAllCachedAdjustedScores - sumCachedStagedScores + sumNewStagedScores) / virtualN;

  if (hypotheticalMean > config.thresholds.meanSlop) {
    return {
      failed: true,
      reason: `Hypothetical project mean (${hypotheticalMean.toFixed(1)}) exceeds threshold (${config.thresholds.meanSlop}).`,
    };
  }

  return { failed: false };
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

function appendGitignore(cwd: string): void {
  const gitignorePath = join(cwd, '.gitignore');
  const entry = '.slop-audit/';
  if (existsSync(gitignorePath)) {
    const content = readFileSync(gitignorePath, 'utf8');
    if (content.includes(entry)) return;
    const normalized = content.endsWith('\n') ? content : `${content}\n`;
    writeFileSync(gitignorePath, `${normalized}${entry}\n`);
  } else {
    writeFileSync(gitignorePath, `${entry}\n`);
  }
}

async function runDoctor(cwd: string): Promise<number> {
  let exitCode = 0;

  logger.info(`Platform: ${process.platform} ${process.arch}, Node ${process.version}`);

  // Parser binding check.
  try {
    const { parseFile: tryParse } = await import('./engine/parser');
    const testFile = join(cwd, '.slop-audit', '.doctor-test.ts');
    mkdirSync(dirname(testFile), { recursive: true });
    writeFileSync(testFile, 'export const x = 1;\n');
    await tryParse(testFile);
    rmSync(testFile, { force: true });
    logger.info('Parser bindings are functional.');
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(`Error: parser binding check failed (${message}).`);
    exitCode = 3;
  }

  // Registry snapshot check.
  const refresh = await refreshRegistrySnapshot(cwd);
  if (!refresh.ok) {
    copyBundledSnapshotToCache(cwd);
  }
  const fresh = isRegistryFresh(cwd);
  if (!fresh) {
    logger.warn(
      `Warning: shadcn/ui registry snapshot is missing or older than bundled version ${BUNDLED_REGISTRY_VERSION}.`,
    );
  } else {
    logger.info('shadcn/ui registry snapshot is up-to-date.');
  }
  logger.info(refresh.message);

  // Baseline cache structural integrity check.
  const baselineCache = loadBaseline(cwd);
  if (baselineCache) {
    const configHash = hashConfig(await loadConfig(cwd));
    const gitHead = (await getGitHead(cwd)) ?? 'unknown';
    const validation = validateBaseline(baselineCache, configHash, gitHead);
    if (validation.valid) {
      logger.info('Baseline cache is structurally valid and matches config/git state.');
    } else {
      logger.warn(`Warning: baseline cache invalid: ${validation.reason}`);
    }
  } else {
    logger.warn('Warning: no baseline cache found at .slop-audit/cache/baseline.json.');
  }

  return exitCode;
}

function buildBaselineCache(
  report: ProjectReport,
  configHash: string,
  gitHead: string,
  cwd: string,
): BaselineCache {
  const scores: BaselineCache['scores'] = {};
  for (const component of report.components) {
    scores[relative(cwd, component.filePath)] = {
      baselineScore: component.componentScore,
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
  results: FileScanResult[];
  config: ResolvedConfig;
  noIncreaseFailure: boolean;
  baseline?: BaselineCache;
}

async function runScan(
  options: ScanRunOptions,
  explicitPaths?: string[],
): Promise<ScanRunResult> {
  setLoggerQuiet(!!options.quiet);
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

  if (options.cache) {
    process.env.SLOP_AUDIT_CACHE = '1';
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
      if (validation.warning && !options.quiet) {
        logger.warn(`Warning: ${validation.warning}.`);
      }
    } else if (!options.quiet) {
      logger.warn(`Baseline invalid: ${validation.reason}; ignoring.`);
    }
  }

  const pool = new WorkerPool({
    config,
    threadCount: options.threadCount,
    quiet: options.quiet,
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
  const scorableResults = results.filter((result) => !result.parseError);
  const scores = scorableResults.map((result) => scoreFile(result, multiplier, config, baseline, cwd));
  const issueGroups = scorableResults.map((result) => ({
    filePath: result.filePath,
    issues: result.issues,
  }));

  if (options.since && baseline) {
    const scannedPaths = new Set(results.map((result) => result.filePath));
    for (const [filePath, cached] of Object.entries(baseline.scores)) {
      if (scannedPaths.has(filePath)) continue;
      if (!existsSync(filePath)) continue;
      scores.push({
        filePath,
        rawScore: 0,
        componentScore: 0,
        adjustedScore: 0,
        componentCount: cached.componentCount,
      });
      issueGroups.push({ filePath, issues: [] });
    }
  }

  const aggregated = aggregateReport(scores, issueGroups, config);

  const projectIssues = filterIssues(runProjectRules(results, config), options);
  const allIssues = [...results.flatMap((result) => result.issues), ...projectIssues];
  allIssues.sort((a, b) => SEVERITY_WEIGHTS[b.severity] - SEVERITY_WEIGHTS[a.severity]);

  const parseErrors = results
    .filter((result) => result.parseError)
    .map((result) => ({ filePath: result.filePath, error: result.parseError as string }));

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
    fileCount: results.length,
    components: aggregated.components,
    issues: allIssues,
    parseErrors: parseErrors.length > 0 ? parseErrors : undefined,
    baseline: baselineMeta,
    thresholds: config.thresholds,
  };

  let noIncreaseFailure = false;
  if (options.noIncrease) {
    const previous = readRuns(cwd).at(-1);
    if (previous) {
      if (report.slopIndex > previous.slopIndex) {
        noIncreaseFailure = true;
        if (!options.quiet) {
          logger.error(
            `Slop index increased from ${previous.slopIndex.toFixed(1)} to ${report.slopIndex.toFixed(1)}.`,
          );
        }
      }
    } else if (!options.quiet) {
      logger.warn('Warning: no previous run found; --no-increase has nothing to compare.');
    }
  }

  if (config.projectMemory !== false) {
    appendRun(cwd, report, thresholdExceeded(report, config));
  }

  recordTelemetry(cwd, report, results, config);

  return { report, scores, results, config, noIncreaseFailure, baseline };
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
      logger.info(result.filePath);
      for (const entry of entries) {
        logger.info(entry);
      }
    }
  }

  if (!quiet) {
    logger.info(`Fixes applied: ${totalApplied}, skipped: ${totalSkipped}${hasErrors ? ', errors detected' : ''}`);
  }

  return { totalApplied, totalSkipped, hasErrors };
}

function renderOutput(report: ProjectReport, options: CliGlobalOptions, cwd: string): void {
  if (options.suggest) {
    if (!options.quiet) {
      logger.info(formatAdvice(report));
      const diff = formatUnifiedDiff(report, cwd);
      if (diff) {
        logger.info(diff);
      }
    }
    return;
  }

  if (options.json) {
    const json = formatJson(report);
    if (typeof options.json === 'string') {
      writeFileSync(resolve(options.json), json);
      if (!options.quiet) {
        logger.info(`Wrote JSON report to ${options.json}`);
      }
    } else {
      logger.info(json);
    }
    return;
  }

  if (options.format === 'json') {
    logger.info(formatJson(report));
    return;
  }

  if (options.format === 'sarif') {
    const cwd = resolve(options.workspace ?? process.cwd());
    logger.info(formatSarif(report, { cwd }));
    return;
  }

  if (!options.quiet) {
    logger.info(formatPretty(report));
  }
}

async function outputScanResults(report: ProjectReport, options: CliGlobalOptions, cwd: string): Promise<void> {
  if (options.heatmap) {
    const entries = await buildHeatmap(report, cwd);
    logger.info(formatHeatmap(entries, { json: options.format === 'json' }));
    return;
  }
  renderOutput(report, options, cwd);
}

async function watchProject(options: CliGlobalOptions, cwd: string, paths: string[]): Promise<void> {
  let baselineMtime: number | undefined;
  let configPath = findConfigPath(cwd);
  let debounceTimer: ReturnType<typeof setTimeout> | undefined;
  let closed = false;
  let watcher: FSWatcher | undefined;

  const scoresMap = new Map<string, ComponentScore>();
  const issueGroupsMap = new Map<string, Issue[]>();
  let currentConfig: ResolvedConfig | undefined;
  let currentBaseline: BaselineCache | undefined;

  function getBaselineMtime(): number | undefined {
    try {
      return statSync(baselinePath(cwd)).mtimeMs;
    } catch {
      return undefined;
    }
  }

  function buildReport(): ProjectReport {
    const scores = Array.from(scoresMap.values());
    const issueGroups = Array.from(issueGroupsMap.entries()).map(([filePath, issues]) => ({
      filePath,
      issues,
    }));
    const aggregated = aggregateReport(scores, issueGroups, currentConfig ?? DEFAULT_CONFIG);
    const allIssues = Array.from(issueGroupsMap.values()).flat();
    allIssues.sort((a, b) => SEVERITY_WEIGHTS[b.severity] - SEVERITY_WEIGHTS[a.severity]);

    return {
      version: VERSION,
      generatedAt: new Date().toISOString(),
      configPath,
      slopIndex: aggregated.slopIndex,
      assemblyHealth: aggregated.assemblyHealth,
      categoryScores: aggregated.categoryScores,
      p90Score: aggregated.p90Score,
      peakScore: aggregated.peakScore,
      componentCount: aggregated.componentCount,
      fileCount: issueGroupsMap.size,
      components: aggregated.components,
      issues: allIssues,
      thresholds: (currentConfig ?? DEFAULT_CONFIG).thresholds,
    };
  }

  async function applyResult(result: FileScanResult): Promise<void> {
    result.issues = filterIssues(result.issues, options);
    for (const issue of result.issues) {
      if (issue.filePath === undefined) {
        issue.filePath = result.filePath;
      }
    }

    const multiplier = resolveFrameworkMultiplier(currentConfig ?? DEFAULT_CONFIG);
    const score = scoreFile(result, multiplier, currentConfig ?? DEFAULT_CONFIG, currentBaseline, cwd);
    scoresMap.set(result.filePath, score);
    issueGroupsMap.set(result.filePath, result.issues);
  }

  async function scanSingleFile(filePath: string): Promise<void> {
    const result = await scanFile(filePath, currentConfig ?? DEFAULT_CONFIG);
    await applyResult(result);
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
      const { report, results, config, baseline } = await runScan(options, paths);
      currentConfig = config;
      currentBaseline = baseline;
      scoresMap.clear();
      issueGroupsMap.clear();
      for (const result of results) {
        await applyResult(result);
      }
      await outputScanResults(report, options, cwd);

      if (!options.quiet) {
        if (report.baseline) {
          logger.info(baselineStatusMessage(report.baseline));
        }
        if (configChanged) {
          logger.info('Config changed; reloaded.');
        } else if (baselineChanged) {
          logger.info('Baseline changed; reloaded.');
        }
        logger.info('Watching for changes... (press Ctrl+C to stop)');
      }
    } catch (err) {
      logger.error(`Scan failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  baselineMtime = getBaselineMtime();
  await doScan(false);

  if (closed) return;

  const currentFiles = new Set(issueGroupsMap.keys());

  watcher = watch(
    cwd,
    { recursive: true },
    (_eventType, filename) => {
      if (closed || !filename) return;

      const changedPath = resolve(cwd, filename.toString());

      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        debounceTimer = undefined;
        const configChanged = configPath !== undefined && changedPath === configPath;
        const currentBaselineMtime = getBaselineMtime();
        const baselineChanged = currentBaselineMtime !== baselineMtime;

        if (configChanged || baselineChanged) {
          void doScan(configChanged);
          return;
        }

        if (!currentFiles.has(changedPath)) {
          void doScan(false);
          return;
        }

        void (async () => {
          try {
            await scanSingleFile(changedPath);
            const report = buildReport();
            await outputScanResults(report, options, cwd);
            if (!options.quiet) {
              logger.info(`Rescanned ${changedPath}. Watching for changes... (press Ctrl+C to stop)`);
            }
          } catch (err) {
            logger.error(`Incremental scan failed: ${err instanceof Error ? err.message : String(err)}`);
          }
        })();
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
      .option('--doctor', 'run diagnostics')
      .option('--watch', 'watch files and re-run')
      .option('--suggest', 'print remediation advice')
      .option('--heatmap', 'print migration ROI heatmap')
      .option('--quiet', 'suppress non-error output')
      .option('--strict', 'exit 2 if any high-severity issue remains')
      .option('--no-increase', 'exit 2 if slop index increased since last run')
      .option('--baseline', 'save a baseline after this scan')
      .option('--trend [n]', 'print a sparkline of the last n runs', parseTrend)
      .option('--json [path]', 'write JSON report to path or stdout')
      .option('--staged', 'scan only staged files')
      .option('--cache', 'cache parsed AST results locally');

    program
      .command('init')
      .description('create a slop-audit config file')
      .option('--yes', 'overwrite existing config')
      .action(async (cmdOptions: { yes?: boolean }, command: Command) => {
        const options = command.optsWithGlobals() as CliGlobalOptions;
        const cwd = resolve(options.workspace ?? process.cwd());
        const configPath = join(cwd, 'slop-audit.config.mjs');
        const detected = detectStack(cwd);
        const initialConfig = { ...DEFAULT_CONFIG, ...detected };
        const proposed = serializeConfig(initialConfig);
        if (existsSync(configPath) && !cmdOptions.yes) {
          const current = readFileSync(configPath, 'utf8');
          logger.error(`Config file already exists: ${configPath}`);
          logger.error('');
          logger.error('--- current');
          logger.error(current);
          logger.error('+++ proposed');
          logger.error(proposed);
          logger.error('');
          logger.error('Use --yes to overwrite');
          process.exit(2);
        }
        writeFileSync(configPath, serializeConfig(initialConfig));
        appendGitignore(cwd);
        const refresh = await refreshRegistrySnapshot(cwd);
        if (!refresh.ok) {
          copyBundledSnapshotToCache(cwd);
        }
        if (!options.quiet) {
          logger.info(`Created ${configPath}`);
          logger.info(refresh.message);
        }
        if (options.baseline) {
          const { report, config } = await runScan({ ...options, workspace: cwd });
          const configHash = hashConfig(config);
          const gitHead = (await getGitHead(cwd)) ?? 'unknown';
          const cache = buildBaselineCache(report, configHash, gitHead, cwd);
          saveBaseline(cwd, cache);
          if (!options.quiet) {
            logger.info(`Saved baseline to ${baselinePath(cwd)}`);
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
          logger.error('Not a git repository');
          process.exit(2);
        }
        const result = installHook(root);
        if (!options.quiet) {
          logger.info(result.message);
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
          logger.error('Not a git repository');
          process.exit(2);
        }
        const result = uninstallHook(root);
        if (!options.quiet) {
          logger.info(result.message);
        }
        process.exit(result.exitCode);
      });

    program
      .command('badge')
      .description('print a shields.io slop-index badge')
      .action(async (_cmdOptions: Record<string, unknown>, command: Command) => {
        const options = command.optsWithGlobals() as CliGlobalOptions;
        const { report } = await runScan(options);
        logger.info(formatBadge(report));
        process.exit(0);
      });

    program
      .command('suggest')
      .description('print remediation advice')
      .action(async (_cmdOptions: Record<string, unknown>, command: Command) => {
        const options = command.optsWithGlobals() as CliGlobalOptions;
        const { report } = await runScan(options);
        const cwd = resolve(options.workspace ?? process.cwd());
        logger.info(formatAdvice(report));
        const diff = formatUnifiedDiff(report, cwd);
        if (diff) logger.info(diff);
        process.exit(0);
      });

    program
      .command('flywheel')
      .description('summarize aggregated scan telemetry')
      .option('--format <pretty|json>', 'output format', 'pretty')
      .action(async (cmdOptions: { format?: 'pretty' | 'json' }, command: Command) => {
        const options = command.optsWithGlobals() as CliGlobalOptions;
        const cwd = resolve(options.workspace ?? process.cwd());
        const payloads = readTelemetry(cwd);
        if (payloads.length === 0) {
          logger.info('No flywheel telemetry found. Run a scan first.');
          process.exit(0);
        }
        const summary = summarizeTelemetry(payloads);
        logger.info(formatFlywheel(summary, { json: cmdOptions.format === 'json' }));
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

      if (command.getOptionValueSource('workspace') === 'default') {
        const autoRoot = detectMonorepoRoot(process.cwd());
        if (autoRoot) {
          options.workspace = autoRoot;
        }
      }

      if (options.heatmap && options.suggest) {
        logger.error('Error: --heatmap cannot be used with --suggest');
        process.exit(2);
      }

      const cwd = resolve(options.workspace ?? process.cwd());

      if (options.trend !== undefined) {
        const runs = readRuns(cwd);
        if (runs.length === 0) {
          logger.info('No trend data available.');
        } else {
          logger.info(renderTrend(runs, options.trend));
        }
        process.exit(0);
      }

      if (options.doctor) {
        const doctorExit = await runDoctor(cwd);
        if (!options.watch) {
          process.exit(doctorExit);
        }
      }

      if (options.watch) {
        await watchProject(options, cwd, paths);
        return;
      }

      const scanStart = performance.now();
      const { report, scores, config, noIncreaseFailure, baseline } = await runScan(options, paths);
      const scanElapsed = Math.round(performance.now() - scanStart);
      const totalElapsed = Math.round(performance.now() - start);
      const machineReadableStdout =
        options.json === true || options.format === 'json' || options.format === 'sarif';

      if (options.baseline) {
        const cwd = resolve(options.workspace ?? process.cwd());
        const configHash = hashConfig(config);
        const gitHead = (await getGitHead(cwd)) ?? 'unknown';
        const cache = buildBaselineCache(report, configHash, gitHead, cwd);
        saveBaseline(cwd, cache);
        if (!options.quiet) {
          logger.info(`Saved baseline to ${baselinePath(cwd)}`);
        }
      }

      if (options.tighten && baseline) {
        saveBaseline(cwd, baseline);
        if (!options.quiet) {
          logger.info(`Tightened baseline saved (revision ${baseline.baseline_revision}).`);
        }
      }

      if (options.doctor && !options.quiet) {
        logger.info(`Doctor: bootstrap ${totalElapsed - scanElapsed}ms, scan ${scanElapsed}ms`);
      }

      if (report.baseline && !options.quiet) {
        logger.info(baselineStatusMessage(report.baseline));
      }

      if (options.fix) {
        const fixResults = await applyFixes(report, config);
        const { totalApplied, totalSkipped, hasErrors } = printFixSummary(fixResults, options.quiet ?? false);

        if (!options.quiet && !machineReadableStdout) {
          logger.info(`(scan took ${scanElapsed}ms, total ${totalElapsed}ms)`);
        }

        process.exit(hasErrors ? 1 : 0);
      }

      if (options.heatmap) {
        const entries = await buildHeatmap(report, cwd);
        logger.info(formatHeatmap(entries, { json: options.format === 'json' }));
        if (!options.quiet && !machineReadableStdout) {
          logger.info(`(scan took ${scanElapsed}ms, total ${totalElapsed}ms)`);
        }
        process.exit(0);
      }

      renderOutput(report, options, cwd);

      let exitCode: 0 | 1 | 2 = thresholdExceeded(report, config) ? 1 : 0;
      const stagedGatingResult = options.staged ? stagedGating(scores, config, baseline, cwd) : { failed: false };
      if (options.staged && stagedGatingResult.failed) {
        exitCode = 1;
      }
      if (options.strict && report.issues.some((issue) => issue.severity === 'high')) {
        exitCode = 2;
        if (!options.quiet) {
          logger.error('High-severity issues found with --strict.');
        }
      }
      if (noIncreaseFailure) {
        exitCode = 2;
      }

      if (exitCode === 1) {
        if (options.staged && stagedGatingResult.reason) {
          logger.error(`Gating failure: ${stagedGatingResult.reason}`);
        } else {
          const failed = failedThresholdCount(report, config);
          logger.error(`${failed} threshold${failed === 1 ? '' : 's'} failed. See details above.`);
        }
      }
      if (!options.quiet && !machineReadableStdout) {
        logger.info(`(scan took ${scanElapsed}ms, total ${totalElapsed}ms)`);
      }
      process.exit(exitCode);
    };

    program
      .command('scan [paths...]', { isDefault: true })
      .description('scan files for slop')
      .action(scanAction);

    await program.parseAsync(process.argv);
  } catch (err) {
    logger.error(`Unexpected error: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(3);
  }
}
