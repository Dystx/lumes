import {
  isValidIsoTimestamp,
  normalizeDataStateMeta,
  type DataStateMeta,
} from "@/lib/data-state";

const MAX_COUNT = 10_000;
const MAX_ID_LENGTH = 200;
const MAX_TEXT_LENGTH = 1_000;

export type WeatherWarningLevel = "yellow" | "orange" | "red";

export interface WeatherWarningClientRow {
  id: string;
  area: string;
  areaName: string;
  type: string;
  text: string;
  level: WeatherWarningLevel;
  startTime: string;
  endTime: string;
}

export interface WeatherWarningsClientResponse {
  source: "ipma-warnings";
  fetchedAt: string;
  count: number;
  warnings: WeatherWarningClientRow[];
  distribution: { red: number; orange: number; yellow: number };
  dataState?: DataStateMeta;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonNegativeInteger(value: unknown): number | null {
  return typeof value === "number"
    && Number.isInteger(value)
    && value >= 0
    && value <= MAX_COUNT
    ? value
    : null;
}

function boundedText(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text.length > 0 && text.length <= maxLength ? text : null;
}

function normalizeEndTime(value: unknown): string | null {
  if (value === "") return "";
  return isValidIsoTimestamp(value) ? value : null;
}

function normalizeWarning(value: unknown): WeatherWarningClientRow | null {
  if (!isRecord(value)) return null;
  const id = boundedText(value.id, MAX_ID_LENGTH);
  const area = boundedText(value.area, MAX_ID_LENGTH);
  const areaName = boundedText(value.areaName, MAX_TEXT_LENGTH);
  const type = boundedText(value.type, MAX_TEXT_LENGTH);
  const text = boundedText(value.text, MAX_TEXT_LENGTH);
  const startTime = isValidIsoTimestamp(value.startTime) ? value.startTime : null;
  const endTime = normalizeEndTime(value.endTime);
  const level = value.level === "yellow" || value.level === "orange" || value.level === "red"
    ? value.level
    : null;

  if (id === null || area === null || areaName === null || type === null || text === null || startTime === null || endTime === null || level === null) {
    return null;
  }

  return { id, area, areaName, type, text, level, startTime, endTime };
}

/** Normalize one untrusted successful `/api/weather-warnings` response. */
export function normalizeWeatherWarningsResponse(value: unknown): WeatherWarningsClientResponse | null {
  if (!isRecord(value) || value.source !== "ipma-warnings") return null;
  const fetchedAt = isValidIsoTimestamp(value.fetchedAt) ? value.fetchedAt : null;
  const count = nonNegativeInteger(value.count);
  const rawWarnings = Array.isArray(value.warnings) ? value.warnings : null;
  const distribution = isRecord(value.distribution) ? {
    red: nonNegativeInteger(value.distribution.red),
    orange: nonNegativeInteger(value.distribution.orange),
    yellow: nonNegativeInteger(value.distribution.yellow),
  } : null;
  const dataState = value.dataState === undefined ? undefined : normalizeDataStateMeta(value.dataState);

  if (
    fetchedAt === null
    || count === null
    || rawWarnings === null
    || rawWarnings.length > MAX_COUNT
    || distribution === null
    || distribution.red === null
    || distribution.orange === null
    || distribution.yellow === null
    || dataState === null
  ) return null;

  const warnings: WeatherWarningClientRow[] = [];
  const seenIds = new Set<string>();
  for (const rawWarning of rawWarnings) {
    const normalized = normalizeWarning(rawWarning);
    if (normalized !== null && !seenIds.has(normalized.id)) {
      seenIds.add(normalized.id);
      warnings.push(normalized);
    }
  }

  const distributionTotal = distribution.red + distribution.orange + distribution.yellow;
  if (
    warnings.length !== count
    || distributionTotal !== count
    || (dataState?.state === "empty" && count !== 0)
    || (count > 0 && warnings.length === 0)
  ) return null;

  return {
    source: "ipma-warnings",
    fetchedAt,
    count,
    warnings,
    distribution: {
      red: distribution.red,
      orange: distribution.orange,
      yellow: distribution.yellow,
    },
    ...(dataState === undefined ? {} : { dataState }),
  };
}

/** Stable `useFetch` transform: malformed warnings become retryable. */
export function transformWeatherWarningsResponse(value: unknown): WeatherWarningsClientResponse {
  const normalized = normalizeWeatherWarningsResponse(value);
  if (normalized === null) throw new Error("Invalid weather warnings response envelope");
  return normalized;
}
