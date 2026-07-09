// Legacy client-side data fetching hooks (being phased out in favor of use-app-data.ts / useFetch).
// Realtime/SSE and some helpers remain here.

"use client";

import { useState, useEffect, useCallback } from "react";
import type {
  LiveIncident,
  FireRiskResponse,
  WeatherResponse,
  FireStationsResponse,
  SourceHealth,
} from "@/lib/types";
import { SAMPLE_INCIDENTS } from "@/lib/sample-data";

interface FetchState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  usingFallback: boolean;
  refetchedAt: Date | null;
}

// Generic fetcher with fallback
function useLiveData<T>(
  endpoint: string,
  fallback: T | null,
  refreshMs: number | null
): FetchState<T> & { refetch: () => void } {
  const [state, setState] = useState<FetchState<T>>({
    data: fallback,
    loading: true,
    error: null,
    usingFallback: false,
    refetchedAt: null,
  });
  const [refetchTrigger, setRefetchTrigger] = useState(0);

  const refetch = useCallback(() => setRefetchTrigger((n) => n + 1), []);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;

    async function load() {
      try {
        // `cache: "default"` lets the browser honour the `Cache-Control:
        // s-maxage=N, stale-while-revalidate=M` headers set by the API
        // routes. That keeps the page responsive during the 30-second
        // refresh window without flooding the origin with requests —
        // every page-load now goes through the browser cache first.
        const res = await fetch(endpoint, { cache: "default" });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || `HTTP ${res.status}`);
        }
        const json = await res.json();
        if (!cancelled) {
          setState({
            data: json,
            loading: false,
            error: null,
            usingFallback: false,
            refetchedAt: new Date(),
          });
        }
      } catch (err: unknown) {
        if (!cancelled) {
          setState((prev) => ({
            data: fallback,
            loading: false,
            error: err instanceof Error ? err.message : String(err),
            usingFallback: !!fallback,
            refetchedAt: new Date(),
          }));
        }
      }
    }

    load();
    if (refreshMs) {
      timer = setInterval(load, refreshMs);
    }

    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
    };
  }, [endpoint, refreshMs, refetchTrigger]);

  return { ...state, refetch };
}

// === Source health ===
export function useSourceHealth() {
  return useLiveData<{ sources: SourceHealth[] } | null>(
    "/api/source-health",
    null,
    30_000
  );
}

// === Live ANEPC incidents ===
// Adapts LiveIncident shape to the Incident shape the UI expects
export function useLiveIncidents() {
  const raw = useLiveData<{
    incidents: LiveIncident[];
    count: number;
    distribution?: { byType: Record<string, number>; byStatus: Record<string, number> };
    cached?: boolean;
    latencyMs?: number;
  } | null>(
    "/api/incidents",
    null,
    60_000
  );

  // Convert LiveIncident → UI shape used by sample-data.ts Incident type
  const adaptedIncidents = (raw.data?.incidents ?? []).map(adaptLiveToUI);
  const fallbackIncidents = raw.usingFallback ? SAMPLE_INCIDENTS : [];

  return {
    incidents: adaptedIncidents.length > 0 ? adaptedIncidents : fallbackIncidents,
    liveCount: raw.data?.count ?? 0,
    loading: raw.loading,
    error: raw.error,
    usingFallback: raw.usingFallback,
    refetchedAt: raw.refetchedAt,
    distribution: raw.data?.distribution,
    cached: raw.data?.cached,
    latencyMs: raw.data?.latencyMs,
    refetch: raw.refetch,
  };
}

// Adapt LiveIncident → sample-data Incident shape (so UI doesn't need refactoring)
function adaptLiveToUI(live: LiveIncident): any {
  const ts = live.observedAt;
  // Single timeline event from the source data
  const timeline = [
    {
      id: `evt-${live.id}-1`,
      timestamp: ts,
      sourceType: "official" as const,
      sourceName: "ANEPC",
      type: "status_change" as const,
      title: live.properties.statusText || live.properties.statusGroup || "Reported",
      description: `${live.properties.naturezaText || live.properties.rasi || "Occurrence"} — ${live.properties.statusText || ""}. ${live.properties.personnelTotal || 0} personnel, ${live.properties.assetsGround || 0} engines, ${live.properties.assetsAerial || 0} aircraft deployed.`,
      confidence: live.trust.confidence,
      verification: live.trust.verificationStatus,
    },
  ];

  return {
    id: live.id,
    displayName: live.displayName,
    status: live.incidentStatus,
    severity: live.severity,
    latitude: live.geometry.coordinates[1],
    longitude: live.geometry.coordinates[0],
    accuracyM: 500,
    estimatedAreaHa: live.estimatedAreaHa,
    firstDetected: live.firstDetected,
    lastUpdated: live.lastUpdated,
    confidence: live.trust.confidence,
    verification: live.trust.verificationStatus,
    sourceCount: 1,
    sourceTypes: ["official" as const],
    // Weather — will be looked up separately by location
    windKmh: 0,
    windDirection: "—",
    humidity: 0,
    temperatureC: 0,
    aircraft: live.properties.assetsAerial ?? 0,
    engines: live.properties.assetsGround ?? 0,
    personnel: live.properties.personnelTotal ?? 0,
    municipality: live.properties.municipality ?? "—",
    district: live.properties.region ?? "—",
    parish: live.properties.parish ?? "—",
    ipmaRisk: "reduced" as const, // Will be enriched separately
    description: `${live.properties.naturezaText || live.properties.rasi || "Occurrence"} reported at ${live.properties.localidade || live.properties.municipality || "unknown location"}. Status: ${live.properties.statusText || live.properties.statusGroup}. ${live.properties.personnelTotal || 0} personnel on scene with ${live.properties.assetsGround || 0} ground vehicles and ${live.properties.assetsAerial || 0} aircraft. Source: ANEPC Prociv Portal (live data).`,
    timeline,
    // Live data flag
    isLive: true,
    rawProperties: live.properties,
  };
}

// === IPMA fire risk ===
export function useFireRisk() {
  return useLiveData<FireRiskResponse | null>(
    "/api/fire-risk",
    null,
    60 * 60 * 1000 // 1h
  );
}

// === IPMA weather ===
export function useWeather() {
  return useLiveData<WeatherResponse | null>(
    "/api/weather",
    null,
    60 * 60 * 1000
  );
}

// === OSM fire stations ===
export function useFireStations(enabled = false) {
  return useLiveDataLazy<FireStationsResponse | null>(
    "/api/fire-stations",
    null,
    24 * 60 * 60 * 1000, // 24h
    enabled
  );
}

// === IPMA Weather Warnings ===
export interface WeatherWarning {
  id: string;
  area: string;
  areaName: string;
  type: string;
  text: string;
  level: "yellow" | "orange" | "red";
  startTime: string;
  endTime: string;
}

export interface WeatherWarningsResponse {
  source: string;
  fetchedAt: string;
  count: number;
  warnings: WeatherWarning[];
  distribution: { red: number; orange: number; yellow: number };
  cached?: boolean;
}

export function useWeatherWarnings() {
  return useLiveData<WeatherWarningsResponse | null>(
    "/api/weather-warnings",
    null,
    10 * 60 * 1000 // 10 min
  );
}

// === ANEPC Regional Commands ===
export interface RegionalCommand {
  id: string;
  name: string;
  region: string;
  geometry: any;
}

export interface RegionalCommandsResponse {
  source: string;
  fetchedAt: string;
  count: number;
  commands: RegionalCommand[];
  cached?: boolean;
}

export function useRegionalCommands() {
  return useLiveData<RegionalCommandsResponse | null>(
    "/api/regional-commands",
    null,
    24 * 60 * 60 * 1000 // 24h
  );
}

// === NASA FIRMS Satellite Detections ===
export interface SatelliteDetection {
  id: string;
  sourceId: string;
  observedAt: string;
  geometry: { type: "Point"; coordinates: [number, number] };
  properties: {
    satellite: string;
    instrument: string;
    frp: number; // Fire Radiative Power (MW)
    brightness: number;
    confidence: number;
  };
  severity: string;
  displayName: string;
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

export function useSatelliteDetections(enabled = false) {
  return useLiveDataLazy<SatelliteResponse | null>(
    "/api/satellite",
    null,
    15 * 60 * 1000, // 15 min
    enabled
  );
}

// Lazy version of useLiveData — only fetches when `enabled` is true
// Useful for expensive endpoints (e.g. NASA FIRMS) that shouldn't auto-fetch
function useLiveDataLazy<T>(
  endpoint: string,
  fallback: T | null,
  refreshMs: number | null,
  enabled: boolean
): FetchState<T> & { refetch: () => void } {
  const [state, setState] = useState<FetchState<T>>({
    data: fallback,
    loading: false,
    error: null,
    usingFallback: false,
    refetchedAt: null,
  });
  const [refetchTrigger, setRefetchTrigger] = useState(0);

  const refetch = useCallback(() => setRefetchTrigger((n) => n + 1), []);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;

    async function load() {
      try {
        setState((prev) => ({ ...prev, loading: true }));
        // See the note in `useLiveData` above: cache: "default" lets
        // the browser honour the API's Cache-Control headers. This is
        // important for /api/fire-stations and /api/satellite which
        // the user explicitly opts into fetching.
        const res = await fetch(endpoint, { cache: "default" });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || `HTTP ${res.status}`);
        }
        const json = await res.json();
        if (!cancelled) {
          setState({
            data: json,
            loading: false,
            error: null,
            usingFallback: false,
            refetchedAt: new Date(),
          });
        }
      } catch (err: unknown) {
        if (!cancelled) {
          setState({
            data: fallback,
            loading: false,
            error: err instanceof Error ? err.message : String(err),
            usingFallback: !!fallback,
            refetchedAt: new Date(),
          });
        }
      }
    }

    load();
    if (refreshMs) {
      timer = setInterval(load, refreshMs);
    }

    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
    };
  }, [endpoint, refreshMs, refetchTrigger, enabled]);

  return { ...state, refetch };
}

// Find nearest weather station to a given lat/lon
export function findNearestStation(
  observations: WeatherResponse | null,
  lat: number,
  lon: number
): { station: any; distanceKm: number } | null {
  if (!observations?.observations?.length) return null;
  let nearest: any = null;
  let nearestDist = Infinity;
  for (const obs of observations.observations) {
    if (obs.stationLat == null || obs.stationLon == null) continue;
    const dist = haversine(lat, lon, obs.stationLat, obs.stationLon);
    if (dist < nearestDist) {
      nearestDist = dist;
      nearest = obs;
    }
  }
  return nearest ? { station: nearest, distanceKm: nearestDist } : null;
}

function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// Find fire risk for a given lat/lon (nearest municipality)
export function findFireRisk(
  risk: FireRiskResponse | null,
  lat: number,
  lon: number
): { rcm: number; dico: string; distanceKm: number } | null {
  if (!risk?.records?.length) return null;
  let nearest: any = null;
  let nearestDist = Infinity;
  for (const r of risk.records) {
    const dist = haversine(lat, lon, r.latitude, r.longitude);
    if (dist < nearestDist) {
      nearestDist = dist;
      nearest = r;
    }
  }
  return nearest ? { rcm: nearest.rcm, dico: nearest.dico, distanceKm: nearestDist } : null;
}

// === SSE Realtime — push updates via Server-Sent Events with auto-reconnect ===
export function useRealtimeIncidents(onNewIncident?: (incident: any) => void) {
  const [connected, setConnected] = useState(false);
  const [lastEvent, setLastEvent] = useState<{ type: string; timestamp: string } | null>(null);

  useEffect(() => {
    let es: EventSource | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let reconnectDelay = 2000; // Start at 2s, exponential backoff

    const connect = () => {
      try {
        es = new EventSource("/api/realtime");

        es.onopen = () => {
          setConnected(true);
          reconnectDelay = 2000; // Reset backoff on success
        };

        es.onerror = () => {
          setConnected(false);
          if (es) {
            es.close();
            es = null;
          }
          // Auto-reconnect with exponential backoff (max 30s)
          reconnectTimer = setTimeout(() => {
            reconnectDelay = Math.min(reconnectDelay * 1.5, 30000);
            connect();
          }, reconnectDelay);
        };

        es.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            setLastEvent({ type: data.type, timestamp: data.timestamp });

            if (data.type === "new-incident" && onNewIncident) {
              onNewIncident(data.incident);
            }
          } catch {
            // Ignore parse errors
          }
        };
      } catch {
        // EventSource not supported — fall back to polling
        setConnected(false);
      }
    };

    connect();

    return () => {
      if (es) es.close();
      if (reconnectTimer) clearTimeout(reconnectTimer);
    };
  }, []);

  return { connected, lastEvent };
}

// === Persistence stats ===
export function usePersistenceStats() {
  return useLiveData<{ total: number; active: number; resolved: number; snapshots: number } | null>(
    "/api/stats",
    null,
    60_000
  );
}

// === Dashboard — aggregated metrics from /api/dashboard ===
// Replaces client-side compute of summary stats, top priority list, and distribution
export interface DashboardData {
  source: string;
  fetchedAt: string;
  cached?: boolean;
  cacheAge?: number;
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
  };
  topPriority: Array<{
    id: string;
    displayName: string;
    severity: string;
    status: string;
    municipality: string | null;
    district: string | null;
    estimatedAreaHa: number;
    personnel: number;
    firstDetected: string;
    latitude: number | null;
    longitude: number | null;
  }>;
  persistence: { total: number; active: number; resolved: number; snapshots: number } | null;
}

export function useDashboard() {
  return useLiveData<DashboardData | null>("/api/dashboard", null, 60_000);
}

// === News — curated fire-news feed (incidents + official sources) ===
export interface NewsItem {
  id: string;
  title: string;
  source: string;
  sourceUrl: string;
  publishedAt: string;
  category: "incident" | "official" | "weather";
  summary?: string;
  severity?: string;
  municipality?: string;
  href?: string;
}

export interface NewsResponse {
  source: string;
  fetchedAt: string;
  items: NewsItem[];
  counts: { incidents: number; sources: number };
}

export function useNews() {
  return useLiveData<NewsResponse | null>("/api/news", null, 5 * 60_000);
}

// === History — persisted incidents from Prisma (lazy: only fetches when enabled) ===
export function useHistory(status?: string, enabled = false) {
  const endpoint = status ? `/api/history?status=${encodeURIComponent(status)}` : "/api/history";
  return useLiveDataLazy<{ count: number; incidents: any[] } | null>(
    endpoint,
    null,
    60_000,
    enabled
  );
}

// === Followed incidents — browser-local until an authenticated owner exists ===
export function useFollowedIncidents() {
  const [followedIds, setFollowedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem("lumes.followed-incidents");
      setFollowedIds(new Set(stored ? JSON.parse(stored) as string[] : []));
    } catch {
      setFollowedIds(new Set());
    } finally {
      setLoading(false);
    }
  }, []);

  const toggleFollow = useCallback(async (incidentId: string) => {
    const isFollowing = followedIds.has(incidentId);
    // Optimistic update
    setFollowedIds((prev) => {
      const next = new Set(prev);
      if (isFollowing) next.delete(incidentId);
      else next.add(incidentId);
      return next;
    });

    const next = new Set(followedIds);
    if (isFollowing) next.delete(incidentId);
    else next.add(incidentId);
    try {
      window.localStorage.setItem("lumes.followed-incidents", JSON.stringify([...next]));
    } catch {
      // Browser storage can be unavailable in privacy mode; the optimistic
      // in-memory state remains usable for the current session.
    }
  }, [followedIds]);

  return { followedIds, toggleFollow, loading };
}
