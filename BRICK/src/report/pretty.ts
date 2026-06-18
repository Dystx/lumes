import chalk from 'chalk';
import type { Category, ComponentScore, Issue, ProjectReport, Severity } from '../types.js';

const categoryLabels: Record<Category, string> = {
  visual: 'Visual',
  typo: 'Typography',
  wcag: 'Accessibility',
  layout: 'Layout',
  component: 'Component',
  logic: 'Logic',
  arch: 'Architecture',
  perf: 'Performance',
};

function severityColor(severity: Severity): (text: string) => string {
  switch (severity) {
    case 'high':
      return chalk.red;
    case 'medium':
      return chalk.yellow;
    case 'low':
    default:
      return chalk.gray;
  }
}

function countBySeverity(issues: Issue[]): Record<Severity, number> {
  const counts: Record<Severity, number> = { low: 0, medium: 0, high: 0 };
  for (const issue of issues) {
    counts[issue.severity] += 1;
  }
  return counts;
}

function pluralize(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? '' : 's'}`;
}

function formatSummary(report: ProjectReport): string {
  const counts = countBySeverity(report.issues);
  const fileCount = report.fileCount;
  return `Scanned ${pluralize(fileCount, 'file')}, ${pluralize(report.componentCount, 'component')}, ${pluralize(report.issues.length, 'issue')} (high: ${counts.high}, medium: ${counts.medium}, low: ${counts.low})`;
}

function severityBadge(severity: Severity): string {
  const colorize = severityColor(severity);
  const label = severity.toUpperCase().padEnd(6, ' ');
  return colorize(label);
}

function formatCategoryTable(categoryScores: Record<Category, number>): string {
  const rows = (Object.entries(categoryScores) as [Category, number][])
    .sort((a, b) => b[1] - a[1])
    .map(([category, score]) => {
      const label = categoryLabels[category].padEnd(14, ' ');
      const scoreText = score.toFixed(1).padStart(5, ' ');
      return `  ${label} ${scoreText}`;
    });

  return ['Category breakdown', ...rows].join('\n');
}

const thresholdLabels: Record<keyof ProjectReport['thresholds'], string> = {
  meanSlop: 'Project average',
  p90Slop: 'Worst 10% of files',
  individualSlopThreshold: 'Highest single file',
};

function formatThresholds(report: ProjectReport): string[] {
  const thresholds = report.thresholds;
  const rows: string[] = [];
  const checks: Array<{ key: keyof typeof thresholds; value: number }> = [
    { key: 'meanSlop', value: report.slopIndex },
    { key: 'p90Slop', value: report.p90Score },
    { key: 'individualSlopThreshold', value: report.peakScore },
  ];

  let failedCount = 0;
  for (const { key, value } of checks) {
    const limit = thresholds[key];
    const failed = value > limit;
    if (failed) failedCount += 1;
    const label = thresholdLabels[key].padEnd(30, ' ');
    const valueText = `${value.toFixed(1)} / ${limit}`.padStart(12, ' ');
    const status = failed ? 'fail' : 'pass';
    rows.push(`  ${label}${valueText}  ${status}`);
  }

  const result: string[] = ['Thresholds', ...rows];
  if (failedCount > 0) {
    result.push('');
    result.push('Next step: run `slop-audit scan --suggest` to see fixes, or `slop-audit scan --baseline` to accept today\'s scores as the new baseline.');
  } else {
    result.push('');
    result.push('All thresholds passed.');
  }
  return result;
}

function formatTopComponents(components: ComponentScore[]): string {
  const offenders = [...components]
    .sort((a, b) => b.adjustedScore - a.adjustedScore)
    .slice(0, 5);

  if (offenders.length === 0) {
    return '';
  }

  const rows = offenders.map((component) => {
    const score = component.adjustedScore.toFixed(1).padStart(5, ' ');
    return `  ${score}  ${component.filePath}`;
  });

  return ['Top offending components', ...rows].join('\n');
}

function formatIssue(issue: Issue): string {
  const badge = severityBadge(issue.severity);
  const location = issue.filePath
    ? `${issue.filePath}:${issue.line}:${issue.column}`
    : `${issue.line}:${issue.column}`;
  const header = `[${badge}] ${issue.ruleId} · ${location}`;
  const body = `  ${chalk.dim(issue.message)}`;
  const lines = [header, body];

  if (issue.advice) {
    lines.push(`  ${chalk.cyan('→')} ${issue.advice}`);
  }

  return lines.join('\n');
}

export function formatPretty(report: ProjectReport): string {
  const sections: string[] = [];

  sections.push(formatSummary(report));

  const slopIndex = Math.round(report.slopIndex);
  const assemblyHealth = Math.round(report.assemblyHealth);

  sections.push(
    chalk.bold(`Slop Index: ${slopIndex}  |  Health: ${assemblyHealth}`),
  );
  sections.push(chalk.dim('(lower Slop Index is better; Health is the inverse)'));

  if (report.componentCount <= 10) {
    sections.push(
      chalk.yellow(
        'Small project (10 or fewer components). Averages can be jumpy at this size—focus on individual file scores.',
      ),
    );
  }

  sections.push(formatCategoryTable(report.categoryScores));

  const componentsSection = formatTopComponents(report.components);
  if (componentsSection) {
    sections.push(componentsSection);
  }

  sections.push(...formatThresholds(report));

  if (report.parseErrors && report.parseErrors.length > 0) {
    sections.push(
      chalk.yellow(`Parse errors (${report.parseErrors.length}) — these files were skipped:`),
    );
    for (const { filePath, error } of report.parseErrors) {
      const firstLine = error.split('\n')[0] ?? error;
      sections.push(`  ${filePath}: ${firstLine}`);
    }
    sections.push('');
    sections.push(chalk.dim('Tip: add a path to `exclude` in your config to skip files the parser can\'t handle.'));
  }

  if (report.issues.length > 0) {
    sections.push(`Issues (${report.issues.length})`);
    sections.push(...report.issues.map(formatIssue));
  }

  return sections.join('\n\n');
}
