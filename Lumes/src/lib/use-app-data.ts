// use-app-data — thin wrappers over the generic useFetch for the data
// endpoints used by lumes.pt. Realtime and browser-local follow state live in
// their own focused hooks so every data endpoint shares one fetch contract.

"use client";

import { useFetch } from "./use-fetch";
import { SAMPLE_INCIDENTS, type Incident } from "./sample-data";
import type {
  DashboardResponse,
  HistoryResponse,
  NewsResponse,
  PersistenceStatsResponse,
  RegionalCommandsResponse,
  SatelliteResponse,
  SourceHealth,
} from "./types";
import type { DataStateMeta } from "./data-state";
import { adaptLiveToUI, transformIncidentResponse, type LiveIncidentResponse } from "./incident-client";
import { transformHistoryResponse } from "./history-view";
import { transformIncidentNewsResponse, type IncidentNewsResponse } from "./incident-news-client";
import { transformNewsResponse } from "./news-client";
import { transformWeatherResponse, type WeatherClientResponse } from "./weather-client";
import { transformFireRiskResponse, type FireRiskClientResponse } from "./fire-risk-client";
import { transformDashboardResponse } from "./dashboard-client";
import { transformFireStationsResponse, type FireStationsClientResponse } from "./fire-stations-client";
import { transformPersistenceStatsResponse } from "./persistence-stats-client";
import { transformWeatherWarningsResponse } from "./weather-warnings-client";
import { transformSatelliteResponse } from "./satellite-client";
import { transformRegionalCommandsResponse } from "./regional-commands-client";
import { transformSourceHealthResponse } from "./source-health-client";

export type { IncidentNewsResponse, MatchedNewsItem } from "./incident-news-client";

export function shouldUseLiveIncidentFallback(
  data: LiveIncidentResponse | null,
  usingFallback: boolean,
): boolean {
  return usingFallback && data === null;
}

export interface WeatherWarningsResponse {
  source: "ipma-warnings";
  fetchedAt: string;
  count: number;
  warnings: Array<{
    id: string;
    area: string;
    areaName: string;
    type: string;
    text: string;
    level: "yellow" | "orange" | "red";
    startTime: string;
    endTime: string;
  }>;
  distribution: { red: number; orange: number; yellow: number };
  dataState?: DataStateMeta;
}

export type SatelliteClientResponse = SatelliteResponse & {
  dataState?: DataStateMeta;
};

// === Incidents ===
export function useLiveIncidentsNew() {
  const r = useFetch<LiveIncidentResponse | null>("/api/incidents", {
    refreshMs: 60_000,
    fallback: null,
    transform: transformIncidentResponse,
  });

  // ALWAYS return an array (never undefined) — guard at every step
  const adapted = r.data?.incidents.map(adaptLiveToUI) ?? [];
  const fallback: Incident[] = shouldUseLiveIncidentFallback(r.data, r.usingFallback) ? SAMPLE_INCIDENTS : [];
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
    refetchAsync: r.refetchAsync,
  };
}

// === Dashboard ===
export function useDashboardNew() {
  return useFetch<DashboardResponse | null>("/api/dashboard", {
    refreshMs: 60_000,
    fallback: null,
    transform: transformDashboardResponse,
  });
}

// === Fire Risk ===
export function useFireRiskNew() {
  return useFetch<FireRiskClientResponse | null>("/api/fire-risk", {
    refreshMs: 60 * 60_000,
    fallback: null,
    transform: transformFireRiskResponse,
  });
}

// === Weather ===
export function useWeatherNew() {
  return useFetch<WeatherClientResponse | null>("/api/weather", {
    refreshMs: 60 * 60_000,
    fallback: null,
    transform: transformWeatherResponse,
  });
}

// === Fire Stations (lazy) ===
export function useFireStationsNew(enabled = false) {
  return useFetch<FireStationsClientResponse | null>("/api/fire-stations", {
    refreshMs: 24 * 60 * 60_000,
    enabled,
    fallback: null,
    transform: transformFireStationsResponse,
  });
}

// === Source Health ===
export function useSourceHealthNew() {
  return useFetch<{ sources: SourceHealth[]; dataState?: DataStateMeta } | null>("/api/source-health", {
    refreshMs: 30_000,
    fallback: { sources: [] },
    transform: transformSourceHealthResponse,
  });
}

// === Matched news for a specific incident ===
export function useMatchedIncidentNews(incidentId: string | null | undefined) {
  return useFetch<IncidentNewsResponse | null>(
    incidentId ? `/api/incidents/${encodeURIComponent(incidentId)}/news` : "",
    {
      refreshMs: 5 * 60_000,
      enabled: !!incidentId,
      fallback: { incidentId: "", count: 0, items: [] },
      transform: transformIncidentNewsResponse,
    },
  );
}

// === Weather Warnings ===
export function useWeatherWarningsNew() {
  return useFetch<WeatherWarningsResponse | null>("/api/weather-warnings", {
    refreshMs: 10 * 60_000,
    fallback: null,
    transform: transformWeatherWarningsResponse,
  });
}

// === Persistence stats ===
export function usePersistenceStatsNew() {
  return useFetch<PersistenceStatsResponse | null>("/api/stats", {
    refreshMs: 60_000,
    fallback: null,
    transform: transformPersistenceStatsResponse,
  });
}

// === History (lazy) ===
export function useHistoryNew(status?: string, enabled = false) {
  const params = status ? `?status=${encodeURIComponent(status)}` : "";
  return useFetch<HistoryResponse | null>(`/api/history${params}`, {
    refreshMs: 60_000,
    enabled,
    fallback: null,
    transform: transformHistoryResponse,
  });
}

// === News ===
export function useNewsNew() {
  return useFetch<NewsResponse | null>("/api/news", {
    refreshMs: 5 * 60_000,
    fallback: null,
    transform: transformNewsResponse,
  });
}

// === Regional commands ===
export function useRegionalCommandsNew() {
  return useFetch<RegionalCommandsResponse | null>("/api/regional-commands", {
    refreshMs: 24 * 60 * 60_000,
    fallback: null,
    transform: transformRegionalCommandsResponse,
  });
}

// === Satellite (lazy) ===
export function useSatelliteNew(enabled = false) {
  return useFetch<SatelliteClientResponse | null>("/api/satellite", {
    refreshMs: 15 * 60_000,
    enabled,
    fallback: null,
    transform: transformSatelliteResponse,
  });
}
