import { isMainThread, parentPort, workerData } from 'node:worker_threads';
import { parseFile } from './parser';
import { extractFacts } from './visitor';
import { RuleRegistry } from '../rules/registry';
import type { FileScanResult, ResolvedConfig, ScanFacts } from '../types';

export async function scanFile(
  filePath: string,
  config: ResolvedConfig,
  registry?: RuleRegistry,
  cwd = process.cwd(),
): Promise<FileScanResult> {
  try {
    const { ast, nodeCount } = await parseFile(filePath);
    const facts = extractFacts(filePath, ast, nodeCount);

    const activeRegistry = registry ?? new RuleRegistry();
    if (!registry) {
      activeRegistry.loadBuiltins();
    }
    const rules = activeRegistry.createContexts(config, filePath, cwd);
    const issues = rules.flatMap(({ rule, context }) => rule.analyze(context, facts));

    const gapValues = collectGapValues(facts);
    const styleSources = collectStyleSources(facts);

    return {
      filePath,
      componentCount: facts.components.length,
      astNodeCount: nodeCount,
      issues,
      gapValues,
      gapContainerCount: gapValues.length > 0 ? 1 : 0,
      styleSources,
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
  const data = workerData as { filePaths: unknown; config: unknown };
  if (!Array.isArray(data.filePaths)) {
    throw new Error('workerData.filePaths must be an array of file paths');
  }
  if (!data.config || typeof data.config !== 'object') {
    throw new Error('workerData.config must be a ResolvedConfig object');
  }
  const { filePaths, config } = data as { filePaths: string[]; config: ResolvedConfig };

  const registry = new RuleRegistry();
  registry.loadBuiltins();

  for (const filePath of filePaths) {
    const result = await scanFile(filePath, config, registry);
    parentPort?.postMessage(result);
  }
}

function collectGapValues(facts: ScanFacts): string[] {
  const values: string[] = [];
  for (const { value } of facts.staticClassNames) {
    for (const token of value.split(/\s+/)) {
      if (/^gap(-[xy])?-/.test(token)) {
        values.push(token);
      }
    }
  }
  const gapRegex = /\bgap\s*:\s*([^;]+)/gi;
  for (const { source } of facts.styleProps) {
    let match: RegExpExecArray | null;
    while ((match = gapRegex.exec(source)) !== null) {
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
