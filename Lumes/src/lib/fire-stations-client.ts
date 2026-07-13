import {
  isValidIsoTimestamp,
  normalizeDataStateMeta,
  type DataStateMeta,
} from "@/lib/data-state";
import { isPortugalCoordinate } from "@/lib/anepc";
import type { FireStation, FireStationsResponse } from "@/lib/types";

const MAX_STATIONS = 1_000;
const MAX_TEXT_LENGTH = 300;

export type FireStationsClientResponse = Omit<FireStationsResponse, "dataState"> & {
  dataState: DataStateMeta;
  sourceNote?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function optionalText(value: unknown): string | undefined | null {
  if (value === undefined) return undefined;
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length <= MAX_TEXT_LENGTH ? (normalized || undefined) : null;
}

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function normalizeStation(value: unknown): FireStation | null {
  if (!isRecord(value)) return null;
  const id = finiteNumber(value.id);
  const lat = finiteNumber(value.lat);
  const lon = finiteNumber(value.lon);
  const name = optionalText(value.name);
  const operator = optionalText(value.operator);
  const phone = optionalText(value.phone);
  const website = optionalText(value.website);
  const wikidata = optionalText(value.wikidata);
  const city = optionalText(value.city);

  if (
    id === null
    || !Number.isInteger(id)
    || lat === null
    || lon === null
    || !isPortugalCoordinate(lat, lon)
    || name === null
    || operator === null
    || phone === null
    || website === null
    || wikidata === null
    || city === null
  ) return null;

  return {
    id,
    lat,
    lon,
    ...(name === undefined ? {} : { name }),
    ...(operator === undefined ? {} : { operator }),
    ...(phone === undefined ? {} : { phone }),
    ...(website === undefined ? {} : { website }),
    ...(wikidata === undefined ? {} : { wikidata }),
    ...(city === undefined ? {} : { city }),
  };
}

/** Normalize one untrusted successful `/api/fire-stations` response envelope. */
export function normalizeFireStationsResponse(value: unknown): FireStationsClientResponse | null {
  if (!isRecord(value)) return null;

  const source = value.source === "osm-overpass" || value.source === "osm-overpass-fallback"
    ? value.source
    : null;
  const fetchedAt = isValidIsoTimestamp(value.fetchedAt) ? value.fetchedAt : null;
  const count = typeof value.count === "number"
    && Number.isInteger(value.count)
    && value.count >= 0
    && value.count <= MAX_STATIONS
    ? value.count
    : null;
  const dataState = normalizeDataStateMeta(value.dataState);
  const sourceNote = optionalText(value.sourceNote);

  if (!Array.isArray(value.stations) || value.stations.length > MAX_STATIONS) return null;
  const stations = value.stations
    .map(normalizeStation)
    .filter((station): station is FireStation => station !== null);
  const ids = new Set<number>();
  for (const station of stations) {
    if (ids.has(station.id)) return null;
    ids.add(station.id);
  }

  if (
    source === null
    || fetchedAt === null
    || count === null
    || dataState === null
    || sourceNote === null
    || (value.stations.length > 0 && stations.length === 0)
    || count !== stations.length
    || (dataState.state === "empty" && count !== 0)
  ) return null;

  return {
    source,
    fetchedAt,
    count,
    stations,
    dataState,
    ...(sourceNote === undefined ? {} : { sourceNote }),
  };
}

/** Stable `useFetch` transform: malformed station data becomes retryable. */
export function transformFireStationsResponse(value: unknown): FireStationsClientResponse {
  const normalized = normalizeFireStationsResponse(value);
  if (normalized === null) throw new Error("Invalid fire-stations response envelope");
  return normalized;
}
