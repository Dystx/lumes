import { isPortugalCoordinate } from "@/lib/anepc";
import { isValidIsoTimestamp } from "@/lib/data-state";
import { presentIncident } from "@/lib/incident-presentation";
import type { Incident } from "@/lib/sample-data";
import type {
  EventType,
  IncidentStatus,
  LiveIncident,
  Severity,
  SourceType,
  VerificationStatus,
} from "@/lib/types";

const SOURCE_TYPES = ["satellite", "official", "community", "news", "weather"] as const satisfies readonly SourceType[];
const EVENT_TYPES = ["wildfire", "urban_fire", "other_fire", "other"] as const satisfies readonly EventType[];
const INCIDENT_STATUSES = ["detected", "active", "contained", "resolved", "monitoring"] as const satisfies readonly IncidentStatus[];
const SEVERITIES = ["low", "medium", "high", "critical"] as const satisfies readonly Severity[];
const VERIFICATION_STATUSES = ["unverified", "single-source", "corroborated", "officially-verified"] as const satisfies readonly VerificationStatus[];

const MAX_AREA_HECTARES = 10_000_000;
const MAX_RESOURCE_COUNT = 1_000_000;
const MAX_STATUS_CODE = 1_000_000;
const MAX_DURATION_MINUTES = 100_000_000;
const MAX_INCIDENT_COUNT = 1_000_000;
const MAX_DISTRIBUTION_KEYS = 100;
const MAX_LATENCY_MS = 600_000;

type IncidentTextProperty =
  | "numero"
  | "statusText"
  | "statusGroup"
  | "rasi"
  | "naturezaText"
  | "localidade"
  | "locality"
  | "endereco"
  | "municipality"
  | "parish"
  | "region"
  | "subregion";

type IncidentNumericProperty =
  | "statusCode"
  | "personnelTotal"
  | "personnelGround"
  | "personnelAerial"
  | "assetsGround"
  | "assetsAerial"
  | "durationMinutes";

type AdaptedIncident = Incident & {
  geometry: LiveIncident["geometry"];
  rawProperties: LiveIncident["properties"];
};

export interface IncidentDistribution {
  byType: Record<string, number>;
  byStatus: Record<string, number>;
}

export interface LiveIncidentResponse {
  source: string;
  sourceType: string;
  fetchedAt: string;
  totalRaw: number;
  incidents: LiveIncident[];
  count: number;
  distribution?: IncidentDistribution;
  cached?: boolean;
  latencyMs?: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function optionalText(value: unknown): string | undefined | null {
  if (value === undefined) return undefined;
  return typeof value === "string" ? value : null;
}

function boundedNumber(value: unknown, maximum: number): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > maximum) return null;
  return value;
}

function boundedInteger(value: unknown, maximum: number): number | null {
  const number = boundedNumber(value, maximum);
  return number !== null && Number.isInteger(number) ? number : null;
}

function enumValue<T extends string>(value: unknown, values: readonly T[]): T | null {
  return typeof value === "string" && values.includes(value as T) ? value as T : null;
}

function normalizeProperties(value: unknown): LiveIncident["properties"] | null {
  if (!isRecord(value)) return null;

  const properties: LiveIncident["properties"] = {};
  const textKeys: readonly IncidentTextProperty[] = [
    "numero",
    "statusText",
    "statusGroup",
    "rasi",
    "naturezaText",
    "localidade",
    "locality",
    "endereco",
    "municipality",
    "parish",
    "region",
    "subregion",
  ];
  for (const key of textKeys) {
    const text = optionalText(value[key]);
    if (text === null) return null;
    if (text !== undefined) properties[key] = text;
  }

  const numericLimits: Record<IncidentNumericProperty, number> = {
    statusCode: MAX_STATUS_CODE,
    personnelTotal: MAX_RESOURCE_COUNT,
    personnelGround: MAX_RESOURCE_COUNT,
    personnelAerial: MAX_RESOURCE_COUNT,
    assetsGround: MAX_RESOURCE_COUNT,
    assetsAerial: MAX_RESOURCE_COUNT,
    durationMinutes: MAX_DURATION_MINUTES,
  };
  const numericKeys = Object.keys(numericLimits) as IncidentNumericProperty[];
  for (const key of numericKeys) {
    if (value[key] === undefined) continue;
    const number = boundedInteger(value[key], numericLimits[key]);
    if (number === null) return null;
    properties[key] = number;
  }

  return properties;
}

function normalizeGeometry(value: unknown): LiveIncident["geometry"] | null {
  if (!isRecord(value) || value.type !== "Point" || !Array.isArray(value.coordinates) || value.coordinates.length !== 2) {
    return null;
  }
  const [longitude, latitude] = value.coordinates;
  if (typeof longitude !== "number" || typeof latitude !== "number") return null;
  if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) return null;
  if (!isPortugalCoordinate(latitude, longitude)) return null;
  return { type: "Point", coordinates: [longitude, latitude] };
}

function normalizeTrust(value: unknown): LiveIncident["trust"] | null {
  if (!isRecord(value)) return null;
  const confidence = boundedNumber(value.confidence, 1);
  const sourceReputation = boundedNumber(value.sourceReputation, 1);
  const freshnessScore = boundedNumber(value.freshnessScore, 1);
  const corroborationCount = boundedInteger(value.corroborationCount, MAX_RESOURCE_COUNT);
  const verificationStatus = enumValue(value.verificationStatus, VERIFICATION_STATUSES);
  if (
    confidence === null
    || sourceReputation === null
    || freshnessScore === null
    || corroborationCount === null
    || verificationStatus === null
  ) return null;
  return { confidence, sourceReputation, verificationStatus, corroborationCount, freshnessScore };
}

/** Normalize one untrusted successful `/api/incidents` row for client rendering. */
export function normalizeLiveIncident(value: unknown): LiveIncident | null {
  if (!isRecord(value)) return null;

  const id = requiredText(value.id);
  const sourceId = requiredText(value.sourceId);
  const sourceInternalId = requiredText(value.sourceInternalId);
  const observedAt = isValidIsoTimestamp(value.observedAt) ? value.observedAt : null;
  const ingestedAt = isValidIsoTimestamp(value.ingestedAt) ? value.ingestedAt : null;
  const firstDetected = isValidIsoTimestamp(value.firstDetected) ? value.firstDetected : null;
  const lastUpdated = isValidIsoTimestamp(value.lastUpdated) ? value.lastUpdated : null;
  const sourceType = enumValue(value.sourceType, SOURCE_TYPES);
  const eventType = enumValue(value.eventType, EVENT_TYPES);
  const incidentStatus = enumValue(value.incidentStatus, INCIDENT_STATUSES);
  const severity = enumValue(value.severity, SEVERITIES);
  const displayName = requiredText(value.displayName);
  const estimatedAreaHa = boundedNumber(value.estimatedAreaHa, MAX_AREA_HECTARES);
  const geometry = normalizeGeometry(value.geometry);
  const properties = normalizeProperties(value.properties);
  const trust = normalizeTrust(value.trust);

  if (
    id === null
    || sourceId === null
    || sourceInternalId === null
    || observedAt === null
    || ingestedAt === null
    || firstDetected === null
    || lastUpdated === null
    || sourceType === null
    || eventType === null
    || incidentStatus === null
    || severity === null
    || displayName === null
    || estimatedAreaHa === null
    || geometry === null
    || properties === null
    || trust === null
  ) return null;

  return {
    id,
    sourceId,
    sourceInternalId,
    observedAt,
    ingestedAt,
    geometry,
    sourceType,
    properties,
    trust,
    eventType,
    incidentStatus,
    severity,
    displayName,
    estimatedAreaHa,
    firstDetected,
    lastUpdated,
  };
}

/** Drop malformed rows without allowing one bad row to poison the live map. */
export function normalizeLiveIncidents(value: unknown): LiveIncident[] {
  if (!Array.isArray(value)) return [];
  return value
    .map(normalizeLiveIncident)
    .filter((incident): incident is LiveIncident => incident !== null);
}

function normalizeDistributionCounts(value: unknown): Record<string, number> | null {
  if (!isRecord(value)) return null;
  const entries = Object.entries(value);
  if (entries.length > MAX_DISTRIBUTION_KEYS) return null;

  const normalized: Record<string, number> = {};
  for (const [key, rawCount] of entries) {
    if (
      key.trim().length === 0
      || key === "__proto__"
      || key === "constructor"
      || key === "prototype"
    ) return null;
    const count = boundedInteger(rawCount, MAX_INCIDENT_COUNT);
    if (count === null) return null;
    normalized[key] = count;
  }
  return normalized;
}

function normalizeDistribution(value: unknown): IncidentDistribution | undefined | null {
  if (value === undefined) return undefined;
  if (!isRecord(value)) return null;

  const byType = normalizeDistributionCounts(value.byType);
  const byStatus = normalizeDistributionCounts(value.byStatus);
  if (byType === null || byStatus === null) return null;
  return { byType, byStatus };
}

/** Normalize the complete untrusted `/api/incidents` response envelope. */
export function normalizeIncidentResponse(value: unknown): LiveIncidentResponse | null {
  if (!isRecord(value) || !Array.isArray(value.incidents)) return null;

  const source = requiredText(value.source);
  const sourceType = requiredText(value.sourceType);
  const fetchedAt = isValidIsoTimestamp(value.fetchedAt) ? value.fetchedAt : null;
  const totalRaw = boundedInteger(value.totalRaw, MAX_INCIDENT_COUNT);
  const count = boundedInteger(value.count, MAX_INCIDENT_COUNT);
  if (source === null || sourceType === null || fetchedAt === null || totalRaw === null || count === null) return null;

  let cached: boolean | undefined;
  if (value.cached !== undefined) {
    if (typeof value.cached !== "boolean") return null;
    cached = value.cached;
  }

  let latencyMs: number | undefined;
  if (value.latencyMs !== undefined) {
    const normalizedLatency = boundedNumber(value.latencyMs, MAX_LATENCY_MS);
    if (normalizedLatency === null) return null;
    latencyMs = normalizedLatency;
  }

  const distribution = normalizeDistribution(value.distribution);
  if (distribution === null) return null;

  const incidents = normalizeLiveIncidents(value.incidents);
  // An explicitly empty list is a valid empty response. A non-empty list with
  // no renderable rows is a malformed success and must reach useFetch's
  // retryable-error path so stale/fallback data remains visible.
  if (value.incidents.length > 0 && incidents.length === 0) return null;

  if (count !== incidents.length || totalRaw < count) return null;
  if (
    distribution !== undefined
    && (
      Object.values(distribution.byType).reduce((sum, item) => sum + item, 0) !== count
      || Object.values(distribution.byStatus).reduce((sum, item) => sum + item, 0) !== count
    )
  ) return null;

  return {
    source,
    sourceType,
    fetchedAt,
    totalRaw,
    incidents,
    count,
    ...(distribution === undefined ? {} : { distribution }),
    ...(cached === undefined ? {} : { cached }),
    ...(latencyMs === undefined ? {} : { latencyMs }),
  };
}

/** Stable useFetch transform: malformed envelopes become retryable failures. */
export function transformIncidentResponse(value: unknown): LiveIncidentResponse {
  const normalized = normalizeIncidentResponse(value);
  if (normalized === null) throw new Error("Invalid incident response envelope");
  return normalized;
}

/** Adapt only normalized live rows into the legacy map/detail model. */
export function adaptLiveToUI(live: LiveIncident): AdaptedIncident {
  const presentation = presentIncident(live, "pt");
  const [lon, lat] = live.geometry.coordinates;
  const municipality = live.properties.municipality ?? "";
  const district = live.properties.region ?? live.properties.subregion ?? "";
  const parish = live.properties.parish ?? "";
  const sourceType: SourceType = live.sourceType;

  return {
    id: live.id,
    displayName: presentation.title,
    status: live.incidentStatus,
    severity: live.severity,
    estimatedAreaHa: live.estimatedAreaHa,
    accuracyM: 0,
    firstDetected: live.firstDetected,
    lastUpdated: live.lastUpdated || live.observedAt,
    observedAt: live.observedAt,
    receivedAt: live.ingestedAt,
    latitude: lat,
    longitude: lon,
    geometry: live.geometry,
    properties: live.properties,
    municipality,
    district,
    parish,
    rawProperties: live.properties,
    personnel: live.properties.personnelTotal ?? 0,
    engines: live.properties.assetsGround ?? 0,
    aircraft: live.properties.assetsAerial ?? 0,
    confidence: live.trust.confidence,
    verification: live.trust.verificationStatus,
    sourceCount: Math.max(1, live.trust.corroborationCount + 1),
    sourceTypes: [sourceType],
    windKmh: 0,
    windDirection: "—",
    humidity: 0,
    temperatureC: 0,
    ipmaRisk: "reduced" as const,
    description: live.properties.statusText || presentation.stateLabel,
    isLive: true,
    timeline: [
      {
        id: `${live.id}-official`,
        timestamp: live.observedAt || live.firstDetected,
        sourceType: "official" as const,
        sourceName: "ANEPC / Prociv",
        type: "detection" as const,
        title: live.displayName,
        description: live.properties.statusText || "Official report",
        confidence: live.trust.confidence,
        verification: live.trust.verificationStatus,
      },
    ],
    evacuationOrder: false,
  };
}

/** Complete boundary used by the data hook: normalize first, then adapt. */
export function adaptLiveIncidents(value: unknown): AdaptedIncident[] {
  return normalizeLiveIncidents(value).map(adaptLiveToUI);
}
