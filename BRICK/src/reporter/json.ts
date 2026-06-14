import { SlopAuditReport } from "../types";

export function renderJson(report: SlopAuditReport): string {
  return JSON.stringify(report, null, 2);
}
