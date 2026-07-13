// Shared types for live data connectors

import type { DataState, DataStateMeta } from "@/lib/data-state";
import type { SourceTier, SourceTrustStatus } from "@/lib/source-trust";

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
  dataState?: DataStateMeta;
  cached?: boolean;
}

/** Wire shape returned by the persisted incident history endpoint. */
export interface HistoryIncident {
  id: string;
  sourceId: string;
  sourceInternalId: string;
  displayName: string;
  eventType: string;
  status: string;
  severity: string;
  latitude: number;
  longitude: number;
  estimatedAreaHa: number;
  municipality: string | null;
  parish: string | null;
  district: string | null;
  personnelTotal: number;
  assetsGround: number;
  assetsAerial: number;
  confidence: number;
  rasi: string | null;
  naturezaText: string | null;
  statusText: string | null;
  firstSeen: string;
  lastSeen: string;
  firstDetected: string;
  lastUpdated: string;
  createdAt: string;
  updatedAt: string;
}

export interface HistoryResponse {
  count: number;
  total: number;
  incidents: HistoryIncident[];
  fetchedAt: string;
  dataState?: DataStateMeta;
}

export type NewsCategory = "incident" | "official" | "press" | "weather";

export interface NewsItem {
  id: string;
  title: string;
  source: string;
  sourceUrl: string;
  publishedAt: string;
  category: NewsCategory;
  summary?: string;
  severity?: string;
  municipality?: string;
  parish?: string;
  locality?: string;
  district?: string;
  href?: string;
  matched?: boolean;
}

export interface NewsResponse {
  source: string;
  fetchedAt: string;
  matched: NewsItem[];
  incidents: NewsItem[];
  press: NewsItem[];
  sources: NewsItem[];
  placesTracked: string[];
  placesMatched: string[];
  placesUnmatched: string[];
  counts: {
    matched: number;
    incidents: number;
    press: number;
    sources: number;
  };
  dataState?: DataStateMeta;
}

export interface DashboardIncidentProperties {
  statusText?: string;
  statusGroup?: string;
  naturezaText?: string;
  rasi?: string;
  personnelTotal?: number;
  assetsGround?: number;
  assetsAerial?: number;
  municipality?: string;
  region?: string;
  parish?: string;
  latitude?: number;
  longitude?: number;
  displayName?: string;
}

export interface DashboardIncidentRecord {
  id: string;
  severity: string;
  status?: string;
  incidentStatus?: string;
  estimatedAreaHa?: number;
  firstDetected?: string;
  displayName?: string;
  municipality?: string | null;
  district?: string | null;
  parish?: string | null;
  geometry?: { type: "Point"; coordinates: [number, number] };
  properties?: DashboardIncidentProperties;
}

export interface DashboardPriorityIncident {
  id: string;
  displayName: string;
  severity: Severity;
  status: string;
  municipality: string | null;
  district: string | null;
  estimatedAreaHa: number;
  personnel: number;
  firstDetected?: string;
  latitude: number | null;
  longitude: number | null;
}

export interface DashboardResponse {
  source: string;
  dataState: DataStateMeta;
  fetchedAt: string;
  summary: {
    total: number;
    activeCount: number;
    criticalCount: number;
    highCount: number;
    personnel: number;
    aircraft: number;
    engines: number;
    areaHa: number;
  };
  distribution: {
    byType: Record<string, number>;
    byStatus: Record<string, number>;
    byStatusGroup: Record<string, number>;
  };
  topPriority: DashboardPriorityIncident[];
  persistence: {
    total: number;
    active: number;
    resolved: number;
    snapshots: number;
  } | null;
}

/** Aggregate counts returned by the persistence statistics service. */
export interface PersistenceStatsCounts {
  total: number;
  active: number;
  resolved: number;
  snapshots: number;
}

/** Client-facing envelope returned by `/api/stats` on success. */
export interface PersistenceStatsResponse extends PersistenceStatsCounts {
  fetchedAt: string;
  dataState?: DataStateMeta;
}

export type RegionalCommandCoordinate = number | RegionalCommandCoordinate[];

export interface RegionalCommandGeometry {
  type: string;
  coordinates: RegionalCommandCoordinate[];
}

export interface RegionalCommand {
  id: string;
  name: string;
  region: string;
  area?: number;
  geometry: RegionalCommandGeometry | null;
}

export interface RegionalCommandsResponse {
  source: string;
  fetchedAt: string;
  count: number;
  commands: RegionalCommand[];
  dataState?: DataStateMeta;
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
  tier?: SourceTier;
  state?: SourceTrustStatus;
  dataState?: DataState | "disabled";
  lastSuccess: string | null;
  lastError: string | null;
  recordCount: number;
  latencyMs: number | null;
  sourceUpdatedAt?: string | null;
  receivedAt?: string | null;
}
