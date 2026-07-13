import { normalizeDataStateMeta } from "@/lib/data-state";

export interface AerialOverlayFeature {
  type: "Feature";
  geometry: { type: "Point"; coordinates: [number, number, number | null] };
  properties: {
    aircraftType: string | null;
    registration: string | null;
    headingDeg: number | null;
    altitudeBarometricFt: number | null;
    callsign: string | null;
  };
}

export interface AerialOverlayData {
  features: AerialOverlayFeature[];
  sourcesLive: number;
  reason: string | null;
}

export type AerialOverlayNormalization =
  | { state: "healthy" | "partial" | "empty"; data: AerialOverlayData }
  | { state: "invalid"; reason: string };

const DEFAULT_PORTUGAL_BBOX: [number, number, number, number] = [-9.5, 36.95, -6, 42.15];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function nullableString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function nullableNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function normalizeBbox(value: unknown): [number, number, number, number] | null {
  if (!Array.isArray(value) || value.length !== 4 || value.some((part) => typeof part !== "number" || !Number.isFinite(part))) return null;
  const [west, south, east, north] = value;
  if (west >= east || south >= north) return null;
  if (west < DEFAULT_PORTUGAL_BBOX[0] || south < DEFAULT_PORTUGAL_BBOX[1] || east > DEFAULT_PORTUGAL_BBOX[2] || north > DEFAULT_PORTUGAL_BBOX[3]) return null;
  return [west, south, east, north];
}

function isWithinBbox(feature: AerialOverlayFeature, bbox: [number, number, number, number]): boolean {
  const [west, south, east, north] = bbox;
  const [longitude, latitude] = feature.geometry.coordinates;
  return longitude >= west && longitude <= east && latitude >= south && latitude <= north;
}

function normalizeFeature(value: unknown): AerialOverlayFeature | null {
  if (!isRecord(value) || value.type !== "Feature") return null;
  const geometry = isRecord(value.geometry) ? value.geometry : null;
  const coordinates = Array.isArray(geometry?.coordinates) ? geometry.coordinates : null;
  const properties = isRecord(value.properties) ? value.properties : null;
  if (
    geometry?.type !== "Point"
    || !coordinates
    || coordinates.length < 2
    || typeof coordinates[0] !== "number"
    || !Number.isFinite(coordinates[0])
    || typeof coordinates[1] !== "number"
    || !Number.isFinite(coordinates[1])
    || !properties
  ) return null;

  const altitude = coordinates[2];
  if (altitude !== undefined && altitude !== null && (typeof altitude !== "number" || !Number.isFinite(altitude))) return null;

  return {
    type: "Feature",
    geometry: {
      type: "Point",
      coordinates: [coordinates[0], coordinates[1], altitude ?? null],
    },
    properties: {
      aircraftType: nullableString(properties.aircraftType),
      registration: nullableString(properties.registration),
      headingDeg: nullableNumber(properties.headingDeg),
      altitudeBarometricFt: nullableNumber(properties.altitudeBarometricFt),
      callsign: nullableString(properties.callsign),
    },
  };
}

/** Converts the public ADS-B envelope into a safe, renderable subset. */
export function normalizeAerialOverlayResponse(value: unknown): AerialOverlayNormalization {
  if (!isRecord(value) || value.type !== "FeatureCollection" || !Array.isArray(value.features)) {
    return { state: "invalid", reason: "Aerial response was malformed" };
  }

  const bbox = value.bbox === undefined ? DEFAULT_PORTUGAL_BBOX : normalizeBbox(value.bbox);
  if (!bbox) return { state: "invalid", reason: "Aerial response bbox was malformed" };

  const normalizedFeatures = value.features.map(normalizeFeature);
  if (normalizedFeatures.some((feature) => feature === null)) {
    return { state: "invalid", reason: "Aerial response was malformed" };
  }
  const features = (normalizedFeatures as AerialOverlayFeature[]).filter((feature) => isWithinBbox(feature, bbox));

  const dataState = value.dataState === undefined ? null : normalizeDataStateMeta(value.dataState);
  if (value.dataState !== undefined && !dataState) {
    return { state: "invalid", reason: "Aerial response data state was malformed" };
  }
  if (dataState && ((features.length === 0 && dataState.state !== "empty")
    || (features.length > 0 && dataState.state !== "healthy"))) {
    return { state: "invalid", reason: "Aerial response data state was inconsistent" };
  }

  const meta = isRecord(value.meta) ? value.meta : null;
  const sourcesLive = typeof meta?.sources_live === "number" && Number.isFinite(meta.sources_live)
    ? Math.max(0, Math.trunc(meta.sources_live))
    : 0;
  const reason = dataState?.reason ?? null;
  const partial = sourcesLive > 0 && (sourcesLive < 3 || reason !== null);

  return {
    state: features.length === 0 ? "empty" : partial ? "partial" : "healthy",
    data: {
      features,
      sourcesLive,
      reason,
    },
  };
}
