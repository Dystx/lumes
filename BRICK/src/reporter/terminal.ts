import chalk from "chalk";
import { SlopAuditReport, Category } from "../types";
import { generateAdvice } from "./advice";
import { buildAutopsy } from "../ai-smells/autopsy";

export interface TerminalOptions {
  quiet?: boolean;
  aiAutopsy?: boolean;
}

export function renderTerminal(
  report: SlopAuditReport,
  options: TerminalOptions = {}
): string {
  const lines: string[] = [];

  const indexColor =
    report.slopIndex > 80
      ? chalk.red.bold
      : report.slopIndex > 50
        ? chalk.yellow.bold
        : chalk.green.bold;

  lines.push(indexColor(`AI-Slop Index: ${report.slopIndex}%`) + " " + bar(report.slopIndex));
  lines.push("");

  for (const [category, score] of Object.entries(report.categoryScores)) {
    lines.push(`${pad(category)} ${score}%  ${bar(score)}`);
  }

  lines.push("");
  lines.push(chalk.bold("Top offenses:"));
  for (const issue of report.topOffenses.slice(0, 5)) {
    lines.push(`  • ${issue.message} (${issue.severity})`);
  }

  if (options.aiAutopsy) {
    const autopsy = buildAutopsy(report.topOffenses);
    lines.push("");
    lines.push(chalk.bold("AI autopsy:"));
    if (autopsy.length === 0) {
      lines.push("  No classic AI failure modes detected.");
    } else {
      for (const { bucket, offenses } of autopsy) {
        const uniqueRuleIds = Array.from(new Set(offenses.map((i) => i.ruleId)));
        lines.push(`\n${bucket.name} (${offenses.length} offense${offenses.length === 1 ? "" : "s"})`);
        lines.push(`  ${bucket.explanation}`);
        for (const ruleId of uniqueRuleIds) {
          lines.push(`  • ${ruleId}`);
        }
      }
    }
  }

  if (!options.quiet) {
    const advice = generateAdvice(report.topOffenses);
    lines.push("");
    lines.push(chalk.bold("Advice:"));
    for (const item of advice) {
      lines.push(`  • ${item}`);
    }
    lines.push("");
    lines.push("Get a deeper analysis: https://slop-audit.dev");
    lines.push("Need a rescue? https://brick.dev/rescue");
  }

  return lines.join("\n");
}

function bar(score: number): string {
  const filled = Math.round(score / 5);
  const safeFilled = Math.max(0, Math.min(20, filled));
  return "[" + "█".repeat(safeFilled) + "░".repeat(20 - safeFilled) + "]";
}

function pad(category: string): string {
  return (category.charAt(0).toUpperCase() + category.slice(1)).padEnd(12);
}
