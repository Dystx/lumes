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
  const fileCount = report.fileCount ?? 0;
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
        'Small project detected (<=10 components). Scores are not normalized. Focus on keeping individual component scores low.',
      ),
    );
  }

  sections.push(formatCategoryTable(report.categoryScores));

  const componentsSection = formatTopComponents(report.components);
  if (componentsSection) {
    sections.push(componentsSection);
  }

  if (report.parseErrors && report.parseErrors.length > 0) {
    sections.push(
      chalk.yellow(`Parse errors (${report.parseErrors.length}) — results may be incomplete:`),
    );
    for (const { filePath, error } of report.parseErrors) {
      sections.push(`  ${filePath}: ${error}`);
    }
  }

  if (report.issues.length > 0) {
    sections.push(`Issues (${report.issues.length})`);
    sections.push(...report.issues.map(formatIssue));
  }

  return sections.join('\n\n');
}
