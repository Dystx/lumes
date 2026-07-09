// Shared types for live data connectors

export type BasemapMode = "dark" | "light" | "satellite";

export interface SatelliteDetection {
  id: string;
  sourceId: string;
  observedAt: string;
  geometry: { type: "Point"; coordinates: [number, number] };
  properties: {
    satellite: string;
    instrument: string;
    frp: number;
    brightness: number;
    confidence: number;
  };
  severity: string;
  displayName: string;
  sourceType?: SourceType;
  trust?: LiveIncident["trust"];
  eventType?: EventType;
  incidentStatus?: IncidentStatus;
  estimatedAreaHa?: number;
  firstDetected?: string;
  lastUpdated?: string;
}

export interface SatelliteResponse {
  source: string;
  sourceType: string;
  fetchedAt: string;
  count: number;
  bbox: string;
  dayRange: number;
  detections: SatelliteDetection[];
  cached?: boolean;
}

export type SourceType = "satellite" | "official" | "community" | "news" | "weather";
export type VerificationStatus = "unverified" | "single-source" | "corroborated" | "officially-verified";
export type IncidentStatus = "detected" | "active" | "contained" | "resolved" | "monitoring";
export type Severity = "low" | "medium" | "high" | "critical";
export type EventType = "wildfire" | "urban_fire" | "other_fire" | "other";

// Normalized incident shape that the client consumes
export interface LiveIncident {
  id: string;
  sourceId: string;
  sourceInternalId: string;
  observedAt: string;          // ISO 8601
  ingestedAt: string;
  geometry: {
    type: "Point";
    coordinates: [number, number]; // [lon, lat]
  };
  sourceType: SourceType;
  properties: {
    numero?: string;
    statusCode?: number;
    statusText?: string;
    statusGroup?: string;
    rasi?: string;
    naturezaText?: string;
    localidade?: string;
    locality?: string;
    endereco?: string;
    municipality?: string;
    parish?: string;
    region?: string;
    subregion?: string;
    personnelTotal?: number;
    personnelGround?: number;
    personnelAerial?: number;
    assetsGround?: number;
    assetsAerial?: number;
    durationMinutes?: number;
  };
  trust: {
    confidence: number;
    sourceReputation: number;
    verificationStatus: VerificationStatus;
    corroborationCount: number;
    freshnessScore: number;
  };
  eventType: EventType;
  incidentStatus: IncidentStatus;
  severity: Severity;
  displayName: string;
  estimatedAreaHa: number;
  // First/last seen by us
  firstDetected: string;
  lastUpdated: string;
}

export type Trust = LiveIncident["trust"];

// IPMA fire risk record
export interface FireRiskRecord {
  dico: string;          // municipality code
  latitude: number;
  longitude: number;
  rcm: number;           // 0-5 risk level
  dataPrev: string;
}

export interface FireRiskResponse {
  source: "ipma";
  fetchedAt: string;
  dataPrev: string;
  dataRun: string;
  count: number;
  // Aggregated stats
  distribution: Record<number, number>;
  records: FireRiskRecord[];
}

// IPMA weather observation
export interface WeatherObservation {
  stationId: string;
  stationName?: string;
  stationLat?: number;
  stationLon?: number;
  timestamp: string;
  temperature: number;
  humidity: number;
  windSpeedKmh: number;
  windDirectionId: number;
  precipitation: number;
  radiation: number;
  pressure: number;
}

export interface WeatherResponse {
  source: "ipma";
  fetchedAt: string;
  timestamp: string;
  count: number;
  observations: WeatherObservation[];
}

// OSM fire station
export interface FireStation {
  id: number;
  lat: number;
  lon: number;
  name?: string;
  operator?: string;
  phone?: string;
  website?: string;
  wikidata?: string;
  city?: string;
}

export interface FireStationsResponse {
  source: "osm-overpass" | "osm-overpass-fallback";
  fetchedAt: string;
  count: number;
  stations: FireStation[];
  dataState?: "healthy" | "fallback";
  sourceNote?: string;
}

// Source health
export interface SourceHealth {
  sourceId: string;
  sourceName: string;
  status: "ok" | "stale" | "error" | "disabled";
  lastSuccess: string | null;
  lastError: string | null;
  recordCount: number;
  latencyMs: number | null;
}
