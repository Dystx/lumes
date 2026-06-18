import { isMainThread, parentPort, workerData } from 'node:worker_threads';
import { parseFile } from './parser';
import { extractFacts } from './visitor';
import { RuleRegistry } from '../rules/registry';
import { setLoggerQuiet } from './logger';
import type { FileScanResult, Issue, ResolvedConfig, ScanFacts, Severity } from '../types';

function applyRuleOverrides(issues: Issue[], rules: ResolvedConfig['rules']): Issue[] {
  const result: Issue[] = [];
  for (const issue of issues) {
    const override = rules[issue.ruleId];
    if (override === 'off') continue;
    if (override === 'auto' || override === undefined) {
      result.push(issue);
      continue;
    }
    result.push({ ...issue, severity: override });
  }
  return result;
}

export async function scanFile(
  filePath: string,
  config: ResolvedConfig,
  registry?: RuleRegistry,
  cwd = process.cwd(),
): Promise<FileScanResult> {
  try {
    const { ast, nodeCount } = await parseFile(filePath);
    const facts = extractFacts(filePath, ast, nodeCount, config.supportsRsc ?? true);

    const activeRegistry = registry ?? new RuleRegistry();
    if (!registry) {
      activeRegistry.loadBuiltins();
    }
    const rules = activeRegistry.createContexts(config, filePath, cwd);
    const rawIssues = rules.flatMap(({ rule, context }) => rule.analyze(context, facts));
    const issues = applyRuleOverrides(rawIssues, config.rules);

    const gapValues = collectGapValues(facts);
    const styleSources = collectStyleSources(facts);
    const elementTags = facts.allElements.map((e) => e.tag);

    return {
      filePath,
      componentCount: facts.components.length,
      astNodeCount: nodeCount,
      issues,
      gapValues,
      gapContainerCount: gapValues.length,
      styleSources,
      elementTags,
    };
  } catch (err) {
    return {
      filePath,
      componentCount: 0,
      astNodeCount: 0,
      issues: [],
      parseError: err instanceof Error ? err.message : String(err),
      gapValues: [],
      gapContainerCount: 0,
      styleSources: [],
    };
  }
}

async function run(): Promise<void> {
  const data = workerData as { config: unknown; quiet?: unknown };
  if (!data.config || typeof data.config !== 'object') {
    throw new Error('workerData.config must be a ResolvedConfig object');
  }
  setLoggerQuiet(data.quiet === true);
  const { config } = data as { config: ResolvedConfig };

  const registry = new RuleRegistry();
  registry.loadBuiltins();

  if (!parentPort) {
    throw new Error('parentPort is not available in worker thread');
  }

  parentPort.on('message', async (msg: { filePath?: string }) => {
    if (!parentPort || !msg.filePath) return;
    const result = await scanFile(msg.filePath, config, registry);
    parentPort.postMessage({ type: 'result', result });
    parentPort.postMessage({ type: 'ready' });
  });

  parentPort.postMessage({ type: 'ready' });
}

function collectGapValues(facts: ScanFacts): string[] {
  const values: string[] = [];
  // One representative gap token per gap-declaring container.
  for (const { value } of facts.staticClassNames) {
    const firstGap = value.split(/\s+/).find((token) => /^gap(-[xy])?-/.test(token));
    if (firstGap) {
      values.push(firstGap);
    }
  }
  const gapRegex = /\bgap\s*:\s*([^;]+)/i;
  for (const { source } of facts.styleProps) {
    const match = gapRegex.exec(source);
    if (match && match[1]) {
      values.push(match[1].trim());
    }
  }
  return values;
}

function collectStyleSources(facts: ScanFacts): string[] {
  return [
    ...facts.staticClassNames.map((c) => c.value),
    ...facts.styleProps.map((s) => s.source),
  ];
}

if (!isMainThread) {
  run().catch((err) => {
    console.error(err);
    process.exitCode = 1;
    parentPort?.close();
  });
}
