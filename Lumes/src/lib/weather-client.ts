import {
  isValidIsoTimestamp,
  normalizeDataStateMeta,
  type DataStateMeta,
} from "@/lib/data-state";
import type { WeatherObservation, WeatherResponse } from "@/lib/types";
import { normalizeObservationTimestamp } from "@/lib/weather/observations";

const MAX_OBSERVATIONS = 1_000;
const MAX_STATION_ID_LENGTH = 120;
const MAX_STATION_NAME_LENGTH = 200;

export type WeatherClientResponse = WeatherResponse & {
  cached?: boolean;
  dataState?: DataStateMeta;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredText(value: unknown, maximum: number): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length > 0 && normalized.length <= maximum ? normalized : null;
}

function optionalText(value: unknown, maximum: number): string | undefined | null {
  if (value === undefined) return undefined;
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length <= maximum ? (normalized || undefined) : null;
}

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function optionalFiniteNumber(value: unknown): number | undefined | null {
  if (value === undefined) return undefined;
  const normalized = finiteNumber(value);
  return normalized === null ? null : normalized;
}

function isPortugalStationCoordinate(latitude: number, longitude: number): boolean {
  return latitude >= 36.95 && latitude <= 42.15 && longitude >= -9.5 && longitude <= -6;
}

function normalizeObservation(value: unknown): WeatherObservation | null {
  if (!isRecord(value)) return null;

  const stationId = requiredText(value.stationId, MAX_STATION_ID_LENGTH);
  const stationName = optionalText(value.stationName, MAX_STATION_NAME_LENGTH);
  const stationLat = optionalFiniteNumber(value.stationLat);
  const stationLon = optionalFiniteNumber(value.stationLon);
  const timestamp = normalizeObservationTimestamp(value.timestamp);
  const temperature = finiteNumber(value.temperature);
  const humidity = finiteNumber(value.humidity);
  const windSpeedKmh = finiteNumber(value.windSpeedKmh);
  const windDirectionId = finiteNumber(value.windDirectionId);
  const precipitation = finiteNumber(value.precipitation);
  const radiation = finiteNumber(value.radiation);
  const pressure = finiteNumber(value.pressure);

  if (
    stationId === null
    || stationName === null
    || stationLat === null
    || stationLon === null
    || timestamp === null
    || temperature === null
    || humidity === null
    || windSpeedKmh === null
    || windDirectionId === null
    || precipitation === null
    || radiation === null
    || pressure === null
    || (stationLat !== undefined && stationLon === undefined)
    || (stationLon !== undefined && stationLat === undefined)
    || (stationLat !== undefined && stationLon !== undefined && !isPortugalStationCoordinate(stationLat, stationLon))
    || humidity < 0
    || humidity > 100
    || windSpeedKmh < 0
    || !Number.isInteger(windDirectionId)
    || windDirectionId < 0
    || windDirectionId > 8
  ) return null;

  return {
    stationId,
    ...(stationName === undefined ? {} : { stationName }),
    ...(stationLat === undefined ? {} : { stationLat }),
    ...(stationLon === undefined ? {} : { stationLon }),
    timestamp,
    temperature,
    humidity,
    windSpeedKmh,
    windDirectionId,
    precipitation,
    radiation,
    pressure,
  };
}

function normalizeCount(value: unknown): number | null {
  return typeof value === "number"
    && Number.isInteger(value)
    && value >= 0
    && value <= MAX_OBSERVATIONS
    ? value
    : null;
}

/** Normalize one untrusted successful `/api/weather` response envelope. */
export function normalizeWeatherResponse(value: unknown): WeatherClientResponse | null {
  if (!isRecord(value)) return null;

  const source = value.source === "ipma" ? value.source : null;
  const fetchedAt = isValidIsoTimestamp(value.fetchedAt) ? value.fetchedAt : null;
  const count = normalizeCount(value.count);
  const rawTimestamp = typeof value.timestamp === "string" ? value.timestamp : null;
  const timestamp = rawTimestamp === "" ? "" : rawTimestamp === null ? null : normalizeObservationTimestamp(rawTimestamp);
  const cached = value.cached === undefined ? undefined : typeof value.cached === "boolean" ? value.cached : null;
  const dataState = value.dataState === undefined ? undefined : normalizeDataStateMeta(value.dataState);

  if (!Array.isArray(value.observations) || value.observations.length > MAX_OBSERVATIONS) return null;
  const observations = value.observations
    .map(normalizeObservation)
    .filter((observation): observation is WeatherObservation => observation !== null);

  if (
    source === null
    || fetchedAt === null
    || count === null
    || timestamp === null
    || cached === null
    || dataState === null
    || (value.observations.length > 0 && observations.length === 0)
    || count !== observations.length
    || (count === 0 && timestamp !== "")
    || (count > 0 && timestamp === "")
    || (count > 0 && observations.some((observation) => observation.timestamp !== timestamp))
    || (dataState?.state === "empty" && count !== 0)
  ) return null;

  return {
    source,
    fetchedAt,
    timestamp,
    count,
    observations,
    ...(cached === undefined ? {} : { cached }),
    ...(dataState === undefined ? {} : { dataState }),
  };
}

/** Stable `useFetch` transform: malformed weather becomes retryable. */
export function transformWeatherResponse(value: unknown): WeatherClientResponse {
  const normalized = normalizeWeatherResponse(value);
  if (normalized === null) throw new Error("Invalid weather response envelope");
  return normalized;
}
