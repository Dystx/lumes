import { isMainThread, parentPort, workerData } from 'node:worker_threads';
import { parseFile } from './parser';
import { extractFacts } from './visitor';
import { RuleRegistry } from '../rules/registry';
import type { FileScanResult, ResolvedConfig } from '../types';

export async function scanFile(filePath: string, config: ResolvedConfig): Promise<FileScanResult> {
  try {
    const { ast, nodeCount } = await parseFile(filePath);
    const facts = extractFacts(filePath, ast, nodeCount);

    const registry = new RuleRegistry();
    registry.loadBuiltins();
    const rules = registry.createContexts(config, filePath);
    const issues = rules.flatMap(({ rule, context }) => rule.analyze(context, facts));

    return {
      filePath,
      componentCount: facts.components.length,
      astNodeCount: nodeCount,
      issues,
    };
  } catch (err) {
    return {
      filePath,
      componentCount: 0,
      astNodeCount: 0,
      issues: [],
      parseError: err instanceof Error ? err.message : String(err),
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

  for (const filePath of filePaths) {
    const result = await scanFile(filePath, config);
    parentPort?.postMessage(result);
  }
}

if (!isMainThread) {
  run().catch((err) => {
    parentPort?.postMessage({
      filePath: '',
      componentCount: 0,
      astNodeCount: 0,
      issues: [],
      parseError: err instanceof Error ? `Worker fatal error: ${err.message}` : `Worker fatal error: ${String(err)}`,
    });
    process.exitCode = 1;
    parentPort?.close();
  });
}
