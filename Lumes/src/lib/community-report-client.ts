import {
  normalizeDataStateMeta,
  type DataStateMeta,
} from "@/lib/data-state";
import type { ReportRequestPayload } from "@/lib/public-actions";

const MAX_TEXT_LENGTH = 500;
const MAX_ID_LENGTH = 120;

export interface CommunityReportSubmitSuccess {
  ok: true;
  report: { id: string; status: "pending_review" };
  message: string;
  dataState?: DataStateMeta;
}

export interface CommunityReportSubmitFailure {
  ok: false;
  error: string;
  dataState?: DataStateMeta;
}

export type CommunityReportSubmitResponse = CommunityReportSubmitSuccess | CommunityReportSubmitFailure;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function boundedText(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text.length > 0 && text.length <= maxLength ? text : null;
}

function normalizeOptionalDataState(value: Record<string, unknown>): DataStateMeta | undefined | null {
  if (value.dataState === undefined) return undefined;
  return normalizeDataStateMeta(value.dataState);
}

/** Normalize an untrusted `/api/reports` POST body before the modal consumes it. */
export function normalizeCommunityReportSubmitResponse(
  value: unknown,
  httpOk: boolean,
): CommunityReportSubmitResponse | null {
  if (!isRecord(value)) return null;
  const dataState = normalizeOptionalDataState(value);
  if (dataState === null) return null;

  if (httpOk) {
    if (value.ok !== true || !isRecord(value.report)) return null;
    const id = boundedText(value.report.id, MAX_ID_LENGTH);
    if (id === null || value.report.status !== "pending_review") return null;
    const message = boundedText(value.message, MAX_TEXT_LENGTH);
    if (message === null) return null;
    return {
      ok: true,
      report: { id, status: "pending_review" },
      message,
      ...(dataState === undefined ? {} : { dataState }),
    };
  }

  if (value.ok === true) return null;
  const error = boundedText(value.error, MAX_TEXT_LENGTH);
  if (error === null) return null;
  return {
    ok: false,
    error,
    ...(dataState === undefined ? {} : { dataState }),
  };
}

/** Submit one report and reject malformed or non-successful acknowledgements. */
export async function submitCommunityReport(
  payload: ReportRequestPayload,
): Promise<CommunityReportSubmitSuccess> {
  const response = await fetch("/api/reports", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body: unknown = await response.json().catch(() => null);
  const normalized = normalizeCommunityReportSubmitResponse(body, response.ok);
  if (normalized === null) {
    throw new Error(response.ok ? "Invalid report acknowledgement" : "Report submission failed");
  }
  if (!normalized.ok) throw new Error(normalized.error);
  return normalized;
}
