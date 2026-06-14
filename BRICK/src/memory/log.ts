import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { SlopAuditReport, Category } from "../types";

export interface RunRecord {
  timestamp: string;
  version: string;
  slopIndex: number;
  categoryScores: Record<Category, number>;
  topOffenseIds: string[];
  thresholdExceeded: boolean;
}

const LOG_DIR = ".slop-audit";
const LOG_FILE = "log.json";

export function appendRun(
  projectPath: string,
  report: SlopAuditReport,
  thresholds: Record<Category, number> = {
    visual: 0.35,
    typography: 0.35,
    spacing: 0.35,
    component: 0.35,
    logic: 0.5,
    architecture: 0.5,
  }
): void {
  const dir = join(projectPath, LOG_DIR);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const path = join(dir, LOG_FILE);
  const existing: RunRecord[] = existsSync(path) ? JSON.parse(readFileSync(path, "utf-8")) : [];
  const thresholdExceeded = Object.entries(report.categoryScores).some(
    ([category, score]) => score / 100 > (thresholds[category as Category] ?? 1)
  );
  const record: RunRecord = {
    timestamp: report.generatedAt,
    version: report.version,
    slopIndex: report.slopIndex,
    categoryScores: report.categoryScores,
    topOffenseIds: report.topOffenses.map((i) => i.ruleId),
    thresholdExceeded,
  };
  existing.push(record);
  writeFileSync(path, JSON.stringify(existing.slice(-100), null, 2) + "\n");
}

export function readLastRun(projectPath: string): RunRecord | undefined {
  const path = join(projectPath, LOG_DIR, LOG_FILE);
  if (!existsSync(path)) return undefined;
  const records: RunRecord[] = JSON.parse(readFileSync(path, "utf-8"));
  return records.at(-1);
}

export function renderTrend(projectPath: string, limit: number): string {
  const path = join(projectPath, LOG_DIR, LOG_FILE);
  if (!existsSync(path)) return "No runs logged yet.";
  const records: RunRecord[] = JSON.parse(readFileSync(path, "utf-8")).slice(-limit);
  const blocks = ["▁", "▂", "▃", "▄", "▅", "▆", "▇", "█"];
  const max = Math.max(...records.map((r) => r.slopIndex), 1);
  const bars = records.map((r) => blocks[Math.min(blocks.length - 1, Math.round((r.slopIndex / max) * (blocks.length - 1))) ]);
  return `Slop Index trend (last ${records.length} runs): ${bars.join("")}`;
}
