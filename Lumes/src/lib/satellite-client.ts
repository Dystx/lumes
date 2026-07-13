import { isValidIsoTimestamp, normalizeDataStateMeta, type DataStateMeta } from "@/lib/data-state";
import type { EventType, IncidentStatus, SatelliteDetection, SatelliteResponse, Severity, Trust } from "@/lib/types";

const MAX_COUNT = 100_000;
const MAX_TEXT_LENGTH = 300;
const SEVERITIES = ["low", "medium", "high", "critical"] as const satisfies readonly Severity[];
const EVENT_TYPES = ["wildfire", "urban_fire", "other_fire", "other"] as const satisfies readonly EventType[];
const INCIDENT_STATUSES = ["detected", "active", "contained", "resolved", "monitoring"] as const satisfies readonly IncidentStatus[];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function boundedText(value: unknown, maxLength = MAX_TEXT_LENGTH): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text.length > 0 && text.length <= maxLength ? text : null;
}

function nonNegativeFinite(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

function unitInterval(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1 ? value : null;
}

function portugalCoordinate(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isPortugalPoint(coordinates: unknown): coordinates is [number, number] {
  if (!Array.isArray(coordinates) || coordinates.length !== 2) return false;
  const [longitude, latitude] = coordinates;
  return portugalCoordinate(longitude)
    && portugalCoordinate(latitude)
    && longitude >= -9.5
    && longitude <= -6
    && latitude >= 36
    && latitude <= 42.2;
}

function normalizeTrust(value: unknown): Trust | undefined | null {
  if (value === undefined) return undefined;
  if (!isRecord(value)) return null;
  const confidence = unitInterval(value.confidence);
  const sourceReputation = unitInterval(value.sourceReputation);
  const corroborationCount = typeof value.corroborationCount === "number"
    && Number.isInteger(value.corroborationCount)
    ? value.corroborationCount
    : null;
  const freshnessScore = unitInterval(value.freshnessScore);
  const verificationStatus = value.verificationStatus;
  if (
    confidence === null
    || sourceReputation === null
    || corroborationCount === null
    || corroborationCount < 0
    || corroborationCount > MAX_COUNT
    || freshnessScore === null
    || !["unverified", "single-source", "corroborated", "officially-verified"].includes(verificationStatus as string)
  ) return null;
  return {
    confidence,
    sourceReputation,
    verificationStatus: verificationStatus as Trust["verificationStatus"],
    corroborationCount,
    freshnessScore,
  };
}

function optionalTimestamp(value: unknown): string | null {
  if (value === "") return "";
  return isValidIsoTimestamp(value) ? value : null;
}

function normalizeDetection(value: unknown): SatelliteDetection | null {
  if (!isRecord(value) || !isRecord(value.geometry) || value.geometry.type !== "Point") return null;
  if (!isPortugalPoint(value.geometry.coordinates) || !isRecord(value.properties)) return null;

  const id = boundedText(value.id, 200);
  const sourceId = boundedText(value.sourceId, 120);
  const observedAt = isValidIsoTimestamp(value.observedAt) ? value.observedAt : null;
  const satellite = boundedText(value.properties.satellite);
  const instrument = boundedText(value.properties.instrument);
  const frp = nonNegativeFinite(value.properties.frp);
  const brightness = nonNegativeFinite(value.properties.brightness);
  const confidence = unitInterval(value.properties.confidence);
  const severity = SEVERITIES.includes(value.severity as Severity) ? value.severity as Severity : null;
  const displayName = boundedText(value.displayName);
  const sourceType = value.sourceType;
  const eventType = EVENT_TYPES.includes(value.eventType as EventType) ? value.eventType as EventType : null;
  const incidentStatus = INCIDENT_STATUSES.includes(value.incidentStatus as IncidentStatus) ? value.incidentStatus as IncidentStatus : null;
  const estimatedAreaHa = nonNegativeFinite(value.estimatedAreaHa);
  const firstDetected = optionalTimestamp(value.firstDetected);
  const lastUpdated = optionalTimestamp(value.lastUpdated);
  const trust = normalizeTrust(value.trust);

  if (
    id === null
    || sourceId !== "nasa-firms-viirs"
    || observedAt === null
    || satellite === null
    || instrument === null
    || frp === null
    || brightness === null
    || confidence === null
    || severity === null
    || displayName === null
    || sourceType !== "satellite"
    || eventType === null
    || incidentStatus === null
    || estimatedAreaHa === null
    || firstDetected === null
    || lastUpdated === null
    || trust === null
  ) return null;

  return {
    id,
    sourceId,
    observedAt,
    geometry: { type: "Point", coordinates: value.geometry.coordinates },
    properties: { satellite, instrument, frp, brightness, confidence },
    severity,
    displayName,
    sourceType: "satellite",
    ...(trust === undefined ? {} : { trust }),
    eventType,
    incidentStatus,
    estimatedAreaHa,
    firstDetected,
    lastUpdated,
  };
}

function validBbox(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const parts = value.split(",").map((part) => Number(part.trim()));
  // FIRMS uses west,south,north,east ordering for the area endpoint.
  return parts.length === 4 && parts.every(Number.isFinite) && parts[0] < parts[3] && parts[1] < parts[2];
}

/** Normalize one untrusted successful `/api/satellite` response. */
export function normalizeSatelliteResponse(value: unknown): (SatelliteResponse & { dataState?: DataStateMeta }) | null {
  if (!isRecord(value)) return null;
  const source = value.source === "nasa-firms-viirs" ? value.source : null;
  const sourceType = value.sourceType === "satellite" ? value.sourceType : null;
  const fetchedAt = isValidIsoTimestamp(value.fetchedAt) ? value.fetchedAt : null;
  const count = typeof value.count === "number" && Number.isInteger(value.count) && value.count >= 0 && value.count <= MAX_COUNT
    ? value.count
    : null;
  const rawDetections = Array.isArray(value.detections) && value.detections.length <= MAX_COUNT ? value.detections : null;
  const dayRange = typeof value.dayRange === "number" && Number.isInteger(value.dayRange) && value.dayRange >= 1 && value.dayRange <= 7
    ? value.dayRange
    : null;
  const dataState = value.dataState === undefined ? undefined : normalizeDataStateMeta(value.dataState);

  if (source === null || sourceType === null || fetchedAt === null || count === null || rawDetections === null || !validBbox(value.bbox) || dayRange === null || dataState === null) return null;
  if (value.cached !== undefined && typeof value.cached !== "boolean") return null;

  const detections: SatelliteDetection[] = [];
  const seenIds = new Set<string>();
  for (const rawDetection of rawDetections) {
    const normalized = normalizeDetection(rawDetection);
    if (normalized !== null && !seenIds.has(normalized.id)) {
      seenIds.add(normalized.id);
      detections.push(normalized);
    }
  }

  if (
    detections.length !== count
    || (dataState?.state === "empty" && count !== 0)
    || (count > 0 && detections.length === 0)
  ) return null;

  return {
    source,
    sourceType,
    fetchedAt,
    count,
    detections,
    bbox: value.bbox,
    dayRange,
    ...(value.cached === undefined ? {} : { cached: value.cached }),
    ...(dataState === undefined ? {} : { dataState }),
  };
}

/** Stable `useFetch` transform: malformed satellite data becomes retryable. */
export function transformSatelliteResponse(value: unknown): SatelliteResponse & { dataState?: DataStateMeta } {
  const normalized = normalizeSatelliteResponse(value);
  if (normalized === null) throw new Error("Invalid satellite response envelope");
  return normalized;
}
