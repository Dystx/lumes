import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { shouldUseLiveIncidentFallback } from "@/lib/use-app-data";

describe("client data-hook contracts", () => {
  it("keeps the core dashboard, weather, risk, station, warning, stats, history, news, and regional hooks typed", () => {
    const source = readFileSync("src/lib/use-app-data.ts", "utf8");
    const types = readFileSync("src/lib/types.ts", "utf8");

    expect(source).toContain("useFetch<FireRiskClientResponse | null>");
    expect(source).toContain("useFetch<DashboardResponse | null>");
    expect(source).toContain("useFetch<WeatherClientResponse | null>");
    expect(source).toContain("useFetch<FireStationsClientResponse | null>");
    expect(source).toContain("useFetch<WeatherWarningsResponse | null>");
    expect(source).toContain("useFetch<PersistenceStatsResponse | null>");
    expect(source).toContain("useFetch<HistoryResponse | null>");
    expect(source).toContain("useFetch<NewsResponse | null>");
    expect(source).not.toContain("useAerialNew");
    expect(source).not.toContain("AerialClientResponse");
    expect(source).toContain("useFetch<RegionalCommandsResponse | null>");
    expect(source).toContain("useFetch<LiveIncidentResponse | null>");
    expect(source).toContain("transform: transformIncidentResponse");
    expect(source).toContain("transform: transformHistoryResponse");
    expect(source).toContain("transform: transformIncidentNewsResponse");
    expect(source).toContain("transform: transformNewsResponse");
    expect(source).toContain("transform: transformWeatherResponse");
    expect(source).toContain("transform: transformFireRiskResponse");
    expect(source).toContain("transform: transformDashboardResponse");
    expect(source).toContain("transform: transformFireStationsResponse");
    expect(source).toContain("transform: transformPersistenceStatsResponse");
    expect(source).toContain("transform: transformWeatherWarningsResponse");
    expect(source).toContain("transform: transformSatelliteResponse");
    expect(source).toContain("transform: transformRegionalCommandsResponse");
    expect(source).toContain("transform: transformSourceHealthResponse");
    expect(source).toContain("shouldUseLiveIncidentFallback(r.data, r.usingFallback)");
    expect(source).not.toMatch(/export interface PersistenceStatsResponse/);
    expect(types).toContain("export interface PersistenceStatsCounts");
    expect(types).toContain("export interface PersistenceStatsResponse");
  });

  it("only shows synthetic incidents when no live response exists", () => {
    expect(shouldUseLiveIncidentFallback(null, true)).toBe(true);
    expect(shouldUseLiveIncidentFallback(null, false)).toBe(false);
    expect(shouldUseLiveIncidentFallback({
      source: "anepc-prociv-arcgis",
      sourceType: "official",
      fetchedAt: "2026-07-13T10:01:00.000Z",
      totalRaw: 0,
      incidents: [],
      count: 0,
    }, true)).toBe(false);
  });
});
