import type { Incident, TimelineEvent } from "@/lib/sample-data";
import type { HistoryIncident, HistoryResponse, IncidentStatus, Severity } from "@/lib/types";
import { isPortugalCoordinate } from "@/lib/anepc";
import { isValidIsoTimestamp } from "@/lib/data-state";

const HISTORY_EVENT_TYPES = ["wildfire", "urban_fire", "other_fire", "other"] as const;
const HISTORY_STATUSES = ["detected", "active", "contained", "monitoring", "resolved"] as const;
const HISTORY_SEVERITIES = ["low", "medium", "high", "critical"] as const;
const MAX_HISTORY_COUNT = 1_000_000;
const MAX_HISTORY_AREA_HECTARES = 10_000_000;
const MAX_HISTORY_RESOURCE_COUNT = 1_000_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function nullableText(value: unknown): string | null | undefined {
  if (value === null) return null;
  if (typeof value !== "string") return undefined;
  return value.trim() || null;
}

function boundedNumber(value: unknown, maximum: number): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= maximum
    ? value
    : null;
}

function boundedInteger(value: unknown, maximum: number): number | null {
  const number = boundedNumber(value, maximum);
  return number !== null && Number.isInteger(number) ? number : null;
}

function enumValue<T extends string>(value: unknown, values: readonly T[]): T | null {
  return typeof value === "string" && values.includes(value as T) ? value as T : null;
}

/** Normalize one untrusted persisted history row before modal/dashboard use. */
export function normalizeHistoryIncident(value: unknown): HistoryIncident | null {
  if (!isRecord(value)) return null;

  const id = requiredText(value.id);
  const sourceId = requiredText(value.sourceId);
  const sourceInternalId = requiredText(value.sourceInternalId);
  const displayName = requiredText(value.displayName);
  const eventType = enumValue(value.eventType, HISTORY_EVENT_TYPES);
  const status = enumValue(value.status, HISTORY_STATUSES);
  const severity = enumValue(value.severity, HISTORY_SEVERITIES);
  const latitude = boundedNumber(value.latitude, 90);
  const longitude = typeof value.longitude === "number"
    && Number.isFinite(value.longitude)
    && value.longitude >= -180
    && value.longitude <= 180
    ? value.longitude
    : null;
  const estimatedAreaHa = boundedNumber(value.estimatedAreaHa, MAX_HISTORY_AREA_HECTARES);
  const personnelTotal = boundedInteger(value.personnelTotal, MAX_HISTORY_RESOURCE_COUNT);
  const assetsGround = boundedInteger(value.assetsGround, MAX_HISTORY_RESOURCE_COUNT);
  const assetsAerial = boundedInteger(value.assetsAerial, MAX_HISTORY_RESOURCE_COUNT);
  const confidence = boundedNumber(value.confidence, 1);
  const municipality = nullableText(value.municipality);
  const parish = nullableText(value.parish);
  const district = nullableText(value.district);
  const rasi = nullableText(value.rasi);
  const naturezaText = nullableText(value.naturezaText);
  const statusText = nullableText(value.statusText);
  const firstSeen = isValidIsoTimestamp(value.firstSeen) ? value.firstSeen : null;
  const lastSeen = isValidIsoTimestamp(value.lastSeen) ? value.lastSeen : null;
  const firstDetected = isValidIsoTimestamp(value.firstDetected) ? value.firstDetected : null;
  const lastUpdated = isValidIsoTimestamp(value.lastUpdated) ? value.lastUpdated : null;
  const createdAt = isValidIsoTimestamp(value.createdAt) ? value.createdAt : null;
  const updatedAt = isValidIsoTimestamp(value.updatedAt) ? value.updatedAt : null;

  if (
    id === null
    || sourceId === null
    || sourceInternalId === null
    || displayName === null
    || eventType === null
    || status === null
    || severity === null
    || latitude === null
    || longitude === null
    || !isPortugalCoordinate(latitude, longitude)
    || estimatedAreaHa === null
    || personnelTotal === null
    || assetsGround === null
    || assetsAerial === null
    || confidence === null
    || municipality === undefined
    || parish === undefined
    || district === undefined
    || rasi === undefined
    || naturezaText === undefined
    || statusText === undefined
    || firstSeen === null
    || lastSeen === null
    || firstDetected === null
    || lastUpdated === null
    || createdAt === null
    || updatedAt === null
  ) return null;

  return {
    id,
    sourceId,
    sourceInternalId,
    displayName,
    eventType,
    status,
    severity,
    latitude,
    longitude,
    estimatedAreaHa,
    municipality,
    parish,
    district,
    personnelTotal,
    assetsGround,
    assetsAerial,
    confidence,
    rasi,
    naturezaText,
    statusText,
    firstSeen,
    lastSeen,
    firstDetected,
    lastUpdated,
    createdAt,
    updatedAt,
  };
}

/** Normalize the complete untrusted `/api/history` response envelope. */
export function normalizeHistoryResponse(value: unknown): HistoryResponse | null {
  if (!isRecord(value) || !Array.isArray(value.incidents)) return null;

  const count = boundedInteger(value.count, MAX_HISTORY_COUNT);
  const total = boundedInteger(value.total, MAX_HISTORY_COUNT);
  const fetchedAt = isValidIsoTimestamp(value.fetchedAt) ? value.fetchedAt : null;
  if (count === null || total === null || fetchedAt === null) return null;

  const incidents = value.incidents
    .map(normalizeHistoryIncident)
    .filter((incident): incident is HistoryIncident => incident !== null);

  if (value.incidents.length > 0 && incidents.length === 0) return null;
  if (count !== incidents.length || total < count) return null;

  return { count, total, incidents, fetchedAt };
}

/** Stable useFetch transform: malformed history becomes retryable. */
export function transformHistoryResponse(value: unknown): HistoryResponse {
  const normalized = normalizeHistoryResponse(value);
  if (normalized === null) throw new Error("Invalid history response envelope");
  return normalized;
}

/** Adapt a validated historical row into the detail panel's incident model. */
export function adaptHistoryToIncident(history: HistoryIncident): Incident {
  const verification = "officially-verified" as const;
  const sourceType = "official" as const;
  const status = enumValue(history.status, HISTORY_STATUSES) as IncidentStatus | null;
  const severity = enumValue(history.severity, HISTORY_SEVERITIES) as Severity | null;
  if (status === null || severity === null) {
    throw new Error("Invalid normalized history incident");
  }
  const description = history.statusText || "Historical incident";
  const timeline: TimelineEvent = {
    id: `${history.id}-history`,
    timestamp: history.firstDetected,
    sourceType,
    sourceName: "Incident history",
    type: "detection",
    title: history.displayName,
    description,
    confidence: history.confidence,
    verification,
  };

  return {
    id: history.id,
    displayName: history.displayName,
    status,
    severity,
    latitude: history.latitude,
    longitude: history.longitude,
    accuracyM: 0,
    estimatedAreaHa: history.estimatedAreaHa,
    firstDetected: history.firstDetected,
    lastUpdated: history.lastUpdated,
    observedAt: history.firstDetected,
    receivedAt: history.updatedAt,
    confidence: history.confidence,
    verification,
    sourceCount: 1,
    sourceTypes: [sourceType],
    windKmh: 0,
    windDirection: "—",
    humidity: 0,
    temperatureC: 0,
    aircraft: history.assetsAerial,
    engines: history.assetsGround,
    personnel: history.personnelTotal,
    municipality: history.municipality ?? "",
    district: history.district ?? "",
    parish: history.parish ?? "",
    ipmaRisk: "reduced",
    timeline: [timeline],
    description,
    properties: {
      naturezaText: history.naturezaText ?? undefined,
      rasi: history.rasi ?? undefined,
      statusText: history.statusText ?? undefined,
      riskAvailable: false,
    },
    isLive: false,
    evacuationOrder: false,
  };
}

/** Filter persisted history by the same user-visible fields as the modal. */
export function filterHistoryIncidents(
  incidents: readonly HistoryIncident[],
  searchTerm: string,
): HistoryIncident[] {
  const query = searchTerm.trim().toLowerCase();
  if (!query) return [...incidents];

  return incidents.filter((incident) =>
    incident.displayName.toLowerCase().includes(query)
    || incident.municipality?.toLowerCase().includes(query)
    || incident.district?.toLowerCase().includes(query),
  );
}
