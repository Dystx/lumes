import {
  isValidIsoTimestamp,
  normalizeDataStateMeta,
} from "@/lib/data-state";
import type { PersistenceStatsResponse } from "@/lib/types";

const MAX_COUNT = 10_000_000;

export type PersistenceStatsClientResponse = PersistenceStatsResponse;

function nonNegativeInteger(value: unknown): number | null {
  return typeof value === "number"
    && Number.isInteger(value)
    && value >= 0
    && value <= MAX_COUNT
    ? value
    : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Normalize one untrusted successful `/api/stats` response envelope. */
export function normalizePersistenceStatsResponse(value: unknown): PersistenceStatsClientResponse | null {
  if (!isRecord(value)) return null;
  const total = nonNegativeInteger(value.total);
  const active = nonNegativeInteger(value.active);
  const resolved = nonNegativeInteger(value.resolved);
  const snapshots = nonNegativeInteger(value.snapshots);
  const fetchedAt = isValidIsoTimestamp(value.fetchedAt) ? value.fetchedAt : null;
  const dataState = value.dataState === undefined ? undefined : normalizeDataStateMeta(value.dataState);

  if (
    total === null
    || active === null
    || resolved === null
    || snapshots === null
    || fetchedAt === null
    || dataState === null
    || active > total
    || resolved > total
    || (dataState?.state === "empty" && total !== 0)
  ) return null;

  return {
    total,
    active,
    resolved,
    snapshots,
    fetchedAt,
    ...(dataState === undefined ? {} : { dataState }),
  };
}

/** Stable `useFetch` transform: malformed stats become retryable. */
export function transformPersistenceStatsResponse(value: unknown): PersistenceStatsClientResponse {
  const normalized = normalizePersistenceStatsResponse(value);
  if (normalized === null) throw new Error("Invalid persistence stats response envelope");
  return normalized;
}
