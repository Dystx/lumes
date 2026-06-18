import type { TelemetryPayload } from '../engine/telemetry';

export interface FlywheelSummary {
  scanCount: number;
  firstRunAt: string | undefined;
  latestRunAt: string | undefined;
  averageSlopIndex: number;
  latestSlopIndex: number;
  averageAssemblyHealth: number;
  latestAssemblyHealth: number;
  topViolations: Array<{ ruleId: string; count: number }>;
  topFiles: Array<{ hash: string; averageScore: number; occurrences: number }>;
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export function summarizeTelemetry(payloads: TelemetryPayload[]): FlywheelSummary {
  const sorted = [...payloads].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
  );

  const slopIndexes = sorted.map((p) => p.project.slopIndex);
  const assemblyHealths = sorted.map((p) => p.project.assemblyHealth);

  const violationCounts = new Map<string, number>();
  const fileScores = new Map<string, number[]>();
  const fileRuleIds = new Map<string, Set<string>>();

  for (const payload of sorted) {
    for (const violation of payload.violations) {
      violationCounts.set(violation.ruleId, (violationCounts.get(violation.ruleId) ?? 0) + violation.count);
    }

    for (const file of payload.files) {
      const existing = fileScores.get(file.hash);
      if (existing) {
        existing.push(file.score);
      } else {
        fileScores.set(file.hash, [file.score]);
      }

      const rules = fileRuleIds.get(file.hash) ?? new Set<string>();
      for (const ruleId of file.ruleIds) {
        rules.add(ruleId);
      }
      fileRuleIds.set(file.hash, rules);
    }
  }

  const topViolations = [...violationCounts.entries()]
    .map(([ruleId, count]) => ({ ruleId, count }))
    .sort((a, b) => b.count - a.count || a.ruleId.localeCompare(b.ruleId))
    .slice(0, 10);

  const topFiles = [...fileScores.entries()]
    .map(([hash, scores]) => ({
      hash,
      averageScore: average(scores),
      occurrences: scores.length,
    }))
    .sort((a, b) => b.averageScore - a.averageScore)
    .slice(0, 10);

  return {
    scanCount: sorted.length,
    firstRunAt: sorted[0]?.timestamp,
    latestRunAt: sorted[sorted.length - 1]?.timestamp,
    averageSlopIndex: average(slopIndexes),
    latestSlopIndex: slopIndexes[slopIndexes.length - 1] ?? 0,
    averageAssemblyHealth: average(assemblyHealths),
    latestAssemblyHealth: assemblyHealths[assemblyHealths.length - 1] ?? 0,
    topViolations,
    topFiles,
  };
}

export function formatFlywheel(summary: FlywheelSummary, options: { json?: boolean } = {}): string {
  if (options.json) {
    return JSON.stringify(summary, null, 2);
  }

  const lines: string[] = [];
  lines.push(`Flywheel summary`);
  lines.push(`  Scans: ${summary.scanCount}`);
  if (summary.firstRunAt && summary.latestRunAt) {
    lines.push(`  Window: ${summary.firstRunAt} → ${summary.latestRunAt}`);
  }
  lines.push(`  Average slop index: ${summary.averageSlopIndex.toFixed(2)}`);
  lines.push(`  Latest slop index: ${summary.latestSlopIndex.toFixed(2)}`);
  lines.push(`  Average assembly health: ${summary.averageAssemblyHealth.toFixed(2)}`);
  lines.push(`  Latest assembly health: ${summary.latestAssemblyHealth.toFixed(2)}`);

  if (summary.topViolations.length > 0) {
    lines.push(`  Top violations:`);
    for (const { ruleId, count } of summary.topViolations) {
      lines.push(`    ${count}x ${ruleId}`);
    }
  }

  if (summary.topFiles.length > 0) {
    lines.push(`  Top files by average score:`);
    for (const { hash, averageScore, occurrences } of summary.topFiles) {
      lines.push(`    ${averageScore.toFixed(1)}  ${hash} (${occurrences} scan${occurrences === 1 ? '' : 's'})`);
    }
  }

  return lines.join('\n');
}
