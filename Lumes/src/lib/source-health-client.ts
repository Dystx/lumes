import { isValidIsoTimestamp, normalizeDataStateMeta, type DataState, type DataStateMeta } from "@/lib/data-state";
import type { SourceHealth } from "@/lib/types";
import type { SourceTier, SourceTrustStatus } from "@/lib/source-trust";

const MAX_SOURCES = 100;
const MAX_COUNT = 1_000_000;
const MAX_LATENCY_MS = 600_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function boundedText(value: unknown, allowNull = false): string | null {
  if (value === null && allowNull) return null;
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text.length > 0 && text.length <= 500 ? text : null;
}

function optionalTimestamp(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  return isValidIsoTimestamp(value) ? value : null;
}

function normalizeSource(value: unknown): SourceHealth | null {
  if (!isRecord(value)) return null;
  const sourceId = boundedText(value.sourceId);
  const sourceName = boundedText(value.sourceName);
  const status = value.status;
  const tier = value.tier;
  const state = value.state;
  const dataState = value.dataState;
  const recordCount = value.recordCount;
  const latencyMs = value.latencyMs;
  const lastSuccess = optionalTimestamp(value.lastSuccess);
  const sourceUpdatedAt = optionalTimestamp(value.sourceUpdatedAt);
  const receivedAt = optionalTimestamp(value.receivedAt);
  const lastError = boundedText(value.lastError, true);

  if (
    sourceId === null
    || sourceName === null
    || !["ok", "stale", "error", "disabled"].includes(status as string)
    || (tier !== undefined && !["core", "optional"].includes(tier as string))
    || (state !== undefined && !["healthy", "stale", "fallback", "error", "disabled"].includes(state as string))
    || (dataState !== undefined && !["healthy", "stale", "fallback", "empty", "retryable-error", "disabled"].includes(dataState as string))
    || typeof recordCount !== "number"
    || !Number.isInteger(recordCount)
    || recordCount < 0
    || recordCount > MAX_COUNT
    || (latencyMs !== null && (typeof latencyMs !== "number" || !Number.isFinite(latencyMs) || latencyMs < 0 || latencyMs > MAX_LATENCY_MS))
    || lastSuccess === null && value.lastSuccess !== null && value.lastSuccess !== undefined
    || sourceUpdatedAt === null && value.sourceUpdatedAt !== null && value.sourceUpdatedAt !== undefined
    || receivedAt === null && value.receivedAt !== null && value.receivedAt !== undefined
    || lastError === null && value.lastError !== null && value.lastError !== undefined
  ) return null;

  return {
    sourceId,
    sourceName,
    status: status as SourceHealth["status"],
    ...(tier === undefined ? {} : { tier: tier as SourceTier }),
    ...(state === undefined ? {} : { state: state as SourceTrustStatus }),
    ...(dataState === undefined ? {} : { dataState: dataState as DataState | "disabled" }),
    lastSuccess,
    lastError,
    recordCount,
    latencyMs: latencyMs as number | null,
    sourceUpdatedAt,
    receivedAt,
  };
}

/** Normalize one untrusted successful `/api/source-health` response. */
export function normalizeSourceHealthResponse(value: unknown): { sources: SourceHealth[]; fetchedAt: string; cached?: boolean; dataState?: DataStateMeta } | null {
  if (!isRecord(value) || !Array.isArray(value.sources) || value.sources.length > MAX_SOURCES) return null;
  const fetchedAt = isValidIsoTimestamp(value.fetchedAt) ? value.fetchedAt : null;
  const dataState = value.dataState === undefined ? undefined : normalizeDataStateMeta(value.dataState);
  if (fetchedAt === null || dataState === null || (value.cached !== undefined && typeof value.cached !== "boolean")) return null;

  const sources: SourceHealth[] = [];
  const seenIds = new Set<string>();
  for (const rawSource of value.sources) {
    const normalized = normalizeSource(rawSource);
    if (normalized === null) continue;
    if (seenIds.has(normalized.sourceId)) return null;
    seenIds.add(normalized.sourceId);
    sources.push(normalized);
  }

  if (
    (value.sources.length > 0 && sources.length === 0)
    || (dataState?.state === "empty" && sources.length !== 0)
    || (sources.length === 0 && dataState?.state !== "empty")
  ) return null;

  return {
    sources,
    fetchedAt,
    ...(value.cached === undefined ? {} : { cached: value.cached }),
    ...(dataState === undefined ? {} : { dataState }),
  };
}

/** Stable `useFetch` transform: malformed source-health data becomes retryable. */
export function transformSourceHealthResponse(value: unknown): { sources: SourceHealth[]; fetchedAt: string; cached?: boolean; dataState?: DataStateMeta } {
  const normalized = normalizeSourceHealthResponse(value);
  if (normalized === null) throw new Error("Invalid source health response envelope");
  return normalized;
}
