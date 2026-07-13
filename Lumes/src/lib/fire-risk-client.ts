import {
  isValidIsoTimestamp,
  normalizeDataStateMeta,
  type DataStateMeta,
} from "@/lib/data-state";
import type { FireRiskRecord, FireRiskResponse } from "@/lib/types";

const MAX_RECORDS = 1_000;
const MAX_TEXT_LENGTH = 200;
const MIN_LATITUDE = 36.95;
const MAX_LATITUDE = 42.15;
const MIN_LONGITUDE = -9.5;
const MAX_LONGITUDE = -6;

export type FireRiskClientResponse = FireRiskResponse & {
  cached?: boolean;
  riskLabels: string[];
  dataState?: DataStateMeta;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function boundedText(value: unknown, maximum: number): string | null {
  return typeof value === "string" && value.length <= maximum ? value : null;
}

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function normalizeRecord(value: unknown): FireRiskRecord | null {
  if (!isRecord(value)) return null;
  const dico = typeof value.dico === "string" && value.dico.trim().length > 0 && value.dico.length <= MAX_TEXT_LENGTH
    ? value.dico.trim()
    : null;
  const latitude = finiteNumber(value.latitude);
  const longitude = finiteNumber(value.longitude);
  const rcm = finiteNumber(value.rcm);
  const dataPrev = boundedText(value.dataPrev, MAX_TEXT_LENGTH);

  if (
    dico === null
    || latitude === null
    || longitude === null
    || rcm === null
    || dataPrev === null
    || !Number.isInteger(rcm)
    || rcm < 0
    || rcm > 5
    || latitude < MIN_LATITUDE
    || latitude > MAX_LATITUDE
    || longitude < MIN_LONGITUDE
    || longitude > MAX_LONGITUDE
  ) return null;

  return { dico, latitude, longitude, rcm, dataPrev };
}

function normalizeCount(value: unknown): number | null {
  return typeof value === "number"
    && Number.isInteger(value)
    && value >= 0
    && value <= MAX_RECORDS
    ? value
    : null;
}

function normalizeDistribution(value: unknown): Record<number, number> | null {
  if (!isRecord(value)) return null;
  const distribution: Record<number, number> = {};
  for (const [key, rawCount] of Object.entries(value)) {
    if (!/^[0-5]$/.test(key)) return null;
    const count = normalizeCount(rawCount);
    if (count === null) return null;
    distribution[Number(key)] = count;
  }
  return distribution;
}

function hasUniqueDico(records: readonly FireRiskRecord[]): boolean {
  const dicos = new Set<string>();
  for (const record of records) {
    if (dicos.has(record.dico)) return false;
    dicos.add(record.dico);
  }
  return true;
}

/** Normalize one untrusted successful `/api/fire-risk` response envelope. */
export function normalizeFireRiskResponse(value: unknown): FireRiskClientResponse | null {
  if (!isRecord(value)) return null;

  const source = value.source === "ipma" ? value.source : null;
  const fetchedAt = isValidIsoTimestamp(value.fetchedAt) ? value.fetchedAt : null;
  const dataPrev = boundedText(value.dataPrev, MAX_TEXT_LENGTH);
  const dataRun = boundedText(value.dataRun, MAX_TEXT_LENGTH);
  const count = normalizeCount(value.count);
  const distribution = normalizeDistribution(value.distribution);
  const riskLabels = Array.isArray(value.riskLabels) && value.riskLabels.length > 0 && value.riskLabels.length <= 20
    && value.riskLabels.every((label) => typeof label === "string" && label.length <= MAX_TEXT_LENGTH)
    ? value.riskLabels
    : null;
  const cached = value.cached === undefined ? undefined : typeof value.cached === "boolean" ? value.cached : null;
  const dataState = value.dataState === undefined ? undefined : normalizeDataStateMeta(value.dataState);

  if (!Array.isArray(value.records) || value.records.length > MAX_RECORDS) return null;
  const records = value.records
    .map(normalizeRecord)
    .filter((record): record is FireRiskRecord => record !== null);
  const distributionTotal = distribution === null
    ? null
    : Object.values(distribution).reduce((sum, item) => sum + item, 0);

  if (
    source === null
    || fetchedAt === null
    || dataPrev === null
    || dataRun === null
    || count === null
    || distribution === null
    || distributionTotal === null
    || riskLabels === null
    || cached === null
    || dataState === null
    || (value.records.length > 0 && records.length === 0)
    || count !== records.length
    || distributionTotal !== count
    || !hasUniqueDico(records)
    || (dataState?.state === "empty" && count !== 0)
  ) return null;

  return {
    source,
    fetchedAt,
    dataPrev,
    dataRun,
    count,
    distribution,
    records,
    riskLabels,
    ...(cached === undefined ? {} : { cached }),
    ...(dataState === undefined ? {} : { dataState }),
  };
}

/** Stable `useFetch` transform: malformed risk becomes retryable. */
export function transformFireRiskResponse(value: unknown): FireRiskClientResponse {
  const normalized = normalizeFireRiskResponse(value);
  if (normalized === null) throw new Error("Invalid fire-risk response envelope");
  return normalized;
}
