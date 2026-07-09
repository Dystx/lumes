// use-app-data — thin wrappers over the generic useFetch for the 14 data
// endpoints used by lumes.pt. This is the parallel migration path for
// TASK E (refactor plan). The original use-live-data.ts is kept for
// compatibility during the transition; once all consumers migrate we can
// delete it.

"use client";

import { useFetch } from "./use-fetch";
import { SAMPLE_INCIDENTS } from "./sample-data";
import type { LiveIncident } from "./types";
import type { DataStateMeta } from "./data-state";

// Inline minimal adapter (we don't need the full adaptLiveToUI here —
// the dashboard already does the heavy lifting via the API response).
function adaptLiveToUI(live: any) {
  const lat = live.geometry?.coordinates?.[1] ?? live.latitude;
  const lon = live.geometry?.coordinates?.[0] ?? live.longitude;

  const base = {
    id: live.id,
    displayName: live.displayName,
    status: live.incidentStatus,
    severity: live.severity,
    estimatedAreaHa: live.estimatedAreaHa ?? 0,
    firstDetected: live.firstDetected,
    lastUpdated: live.lastUpdated,
    latitude: lat,
    longitude: lon,
    geometry: live.geometry,
    properties: live.properties,
    municipality: live.properties?.municipality,
    district: live.properties?.region,
    parish: live.properties?.parish,
    rawProperties: live.properties,
    personnel: live.properties?.personnelTotal ?? 0,
    engines: live.properties?.assetsGround ?? 0,
    aircraft: live.properties?.assetsAerial ?? 0,
    isLive: true,
    // Provide minimal timeline so map secondary layers (satellite/community dots)
    // and evacuation zones have data to work with on live incidents.
    timeline: [
      {
        id: `${live.id}-official`,
        timestamp: live.observedAt || live.firstDetected,
        sourceType: "official" as const,
        sourceName: "ANEPC / Prociv",
        type: "detection" as const,
        title: live.displayName,
        description: live.properties?.statusText || "Official report",
        confidence: live.trust?.confidence ?? 0.9,
        verification: "officially-verified" as const,
      },
    ],
    evacuationOrder: false,
    sourceCount: 1,
    sourceTypes: ["official"] as const,
  };
  return base;
}

// === Incidents ===
export function useLiveIncidentsNew() {
  const r = useFetch<{
    incidents: LiveIncident[];
    count: number;
    distribution?: { byType: Record<string, number>; byStatus: Record<string, number> };
    cached?: boolean;
    latencyMs?: number;
  } | null>("/api/incidents", { refreshMs: 60_000, fallback: null });

  // ALWAYS return an array (never undefined) — guard at every step
  const rawIncidents = r.data?.incidents;
  const adapted = Array.isArray(rawIncidents) ? rawIncidents.map(adaptLiveToUI) : [];
  const fallback: any[] = r.usingFallback ? SAMPLE_INCIDENTS : [];
  const incidents = adapted.length > 0 ? adapted : fallback;

  return {
    incidents,
    liveCount: r.data?.count ?? 0,
    loading: r.loading,
    error: r.error,
    usingFallback: r.usingFallback,
    refetchedAt: r.refetchedAt,
    dataState: r.dataState,
    trust: r.trust,
    distribution: r.data?.distribution,
    cached: r.data?.cached,
    latencyMs: r.data?.latencyMs,
    refetch: r.refetch,
  };
}

// === Dashboard ===
export function useDashboardNew() {
  return useFetch<any>("/api/dashboard", { refreshMs: 60_000, fallback: null });
}

// === Fire Risk ===
export function useFireRiskNew() {
  return useFetch<any>("/api/fire-risk", { refreshMs: 60 * 60_000, fallback: null });
}

// === Weather ===
export function useWeatherNew() {
  return useFetch<any>("/api/weather", { refreshMs: 60 * 60_000, fallback: null });
}

// === Fire Stations (lazy) ===
export function useFireStationsNew(enabled = false) {
  return useFetch<any>("/api/fire-stations", {
    refreshMs: 24 * 60 * 60_000,
    enabled,
    fallback: null,
  });
}

// === Source Health ===
export function useSourceHealthNew() {
  return useFetch<{ sources: any[]; dataState?: DataStateMeta } | null>("/api/source-health", {
    refreshMs: 30_000,
    fallback: { sources: [] },
  });
}

// === Matched news for a specific incident ===
export interface MatchedNewsItem {
  id: string;
  title: string;
  source: string;
  sourceUrl: string;
  publishedAt: string;
  category: string;
  summary?: string;
  municipality?: string;
  district?: string;
  matched: boolean;
  matchedOn: string | null;
}

export function useMatchedIncidentNews(incidentId: string | null | undefined) {
  return useFetch<{
    incidentId: string;
    count: number;
    items: MatchedNewsItem[];
  } | null>(
    incidentId ? `/api/incidents/${encodeURIComponent(incidentId)}/news` : "",
    { refreshMs: 5 * 60_000, enabled: !!incidentId, fallback: { incidentId: "", count: 0, items: [] } }
  );
}

// === Weather Warnings ===
export function useWeatherWarningsNew() {
  return useFetch<any>("/api/weather-warnings", { refreshMs: 10 * 60_000, fallback: null });
}

// === Persistence stats ===
export function usePersistenceStatsNew() {
  return useFetch<any>("/api/stats", { refreshMs: 60_000, fallback: null });
}

// === History (lazy) ===
export function useHistoryNew(status?: string, enabled = false) {
  const params = status ? `?status=${encodeURIComponent(status)}` : "";
  return useFetch<any>(`/api/history${params}`, {
    refreshMs: 60_000,
    enabled,
    fallback: null,
  });
}

// === News ===
export function useNewsNew() {
  return useFetch<any>("/api/news", { refreshMs: 5 * 60_000, fallback: null });
}

// === Regional commands ===
export function useRegionalCommandsNew() {
  return useFetch<any>("/api/regional-commands", { refreshMs: 24 * 60 * 60_000, fallback: null });
}

// === Satellite (lazy) ===
export function useSatelliteNew(enabled = false) {
  return useFetch<any>("/api/satellite", {
    refreshMs: 15 * 60_000,
    enabled,
    fallback: null,
  });
}

// === Aerial ADS-B ===
export function useAerialNew(enabled = false) {
  return useFetch<any>("/api/aerial", { refreshMs: 60_000, enabled, fallback: null });
}
