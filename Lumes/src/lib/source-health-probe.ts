import type { DataState } from "@/lib/data-state";

const DATA_STATES = new Set<DataState | "disabled">([
  "healthy",
  "stale",
  "fallback",
  "empty",
  "retryable-error",
  "disabled",
]);

const RECORD_ARRAY_KEYS = ["incidents", "records", "stations", "observations"] as const;

type JsonObject = Record<string, unknown>;

export interface NormalizedSourceHealthPayload {
  recordCount: number;
  dataState?: DataState | "disabled";
  reason?: string;
  source?: string;
  sourceNote?: string;
  sourceUpdatedAt: string | null;
}

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeRecordCount(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isInteger(value) || !Number.isFinite(value) || value < 0) {
    return null;
  }
  return value;
}

function readRecordCount(value: JsonObject): number | null {
  if ("count" in value && value.count !== null) {
    return normalizeRecordCount(value.count);
  }

  for (const key of RECORD_ARRAY_KEYS) {
    if (key in value && Array.isArray(value[key])) {
      return value[key].length;
    }
  }

  return null;
}

function normalizeDataState(value: unknown): DataState | "disabled" | undefined | null {
  if (value === undefined || value === null) return undefined;
  const state = typeof value === "string"
    ? value
    : isJsonObject(value) && typeof value.state === "string"
      ? value.state
      : null;

  if (state === null || !DATA_STATES.has(state as DataState | "disabled")) return null;
  return state as DataState | "disabled";
}

function normalizeTimestamp(value: unknown): string | null | undefined {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string" || value.length === 0 || !Number.isFinite(Date.parse(value))) return undefined;
  return value;
}

function sourceTimestamp(value: JsonObject, dataStateValue: unknown): string | null | undefined {
  const dataState = isJsonObject(dataStateValue) ? dataStateValue : null;
  const candidate = dataState?.sourceUpdatedAt
    ?? value.sourceUpdatedAt
    ?? value.fetchedAt
    ?? value.refreshedAt
    ?? value.timestamp;
  return normalizeTimestamp(candidate);
}

function normalizeReason(value: unknown): string | undefined | null {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") return null;
  return value.length > 0 ? value.slice(0, 500) : undefined;
}

function normalizeSourceField(value: unknown): string | undefined | null {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string" || value.trim().length === 0) return null;
  return value;
}

function normalizeSourceNote(value: unknown): string | undefined | null {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") return null;
  return value.length > 0 ? value.slice(0, 500) : undefined;
}

/**
 * Validates the small JSON envelope exposed by Lumes data routes before it is
 * used to derive global source trust. Unknown provider fields are ignored.
 */
export function normalizeSourceHealthPayload(value: unknown): NormalizedSourceHealthPayload | null {
  if (!isJsonObject(value)) return null;

  const recordCount = readRecordCount(value);
  if (recordCount === null) return null;

  const dataState = normalizeDataState(value.dataState);
  if (dataState === null) return null;

  const reason = normalizeReason(isJsonObject(value.dataState) ? value.dataState.reason : undefined);
  if (reason === null) return null;

  const source = normalizeSourceField(value.source);
  if (source === null) return null;

  const sourceNote = normalizeSourceNote(value.sourceNote);
  if (sourceNote === null) return null;

  const sourceUpdatedAt = sourceTimestamp(value, value.dataState);
  if (sourceUpdatedAt === undefined) return null;

  return {
    recordCount,
    ...(dataState === undefined ? {} : { dataState }),
    ...(reason === undefined ? {} : { reason }),
    ...(source === undefined ? {} : { source }),
    ...(sourceNote === undefined ? {} : { sourceNote }),
    sourceUpdatedAt,
  };
}
