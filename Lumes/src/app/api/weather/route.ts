// IPMA weather observations connector — current conditions from 222 stations
// 1h cache

import { NextResponse } from "next/server";
import type { WeatherResponse, WeatherObservation } from "@/lib/types";
import { cached } from "@/lib/api/cache";
import { classifyDataState, createDataStateMeta } from "@/lib/data-state";
import { logServerFailure } from "@/lib/observability";

const OBS_URL = "https://api.ipma.pt/open-data/observation/meteorology/stations/observations.json";
const STATIONS_URL = "https://api.ipma.pt/open-data/observation/meteorology/stations/stations.json";

export async function GET() {
  try {
    const result = await cached("weather", 60 * 60 * 1000, async () => {
      // Fetch observations + station metadata in parallel
      const [obsRes, stationsRes] = await Promise.all([
        fetch(OBS_URL, { headers: { "User-Agent": "lumes.pt-Platform/0.1", Accept: "application/json" } }),
        fetch(STATIONS_URL, { headers: { "User-Agent": "lumes.pt-Platform/0.1", Accept: "application/json" } }),
      ]);

      if (!obsRes.ok || !stationsRes.ok) {
        throw new Error(`IPMA HTTP obs:${obsRes.status} stations:${stationsRes.status}`);
      }

      const obsRaw: any = await obsRes.json();
      const stationsRaw: any[] = await stationsRes.json();

      // Build station lookup
      const stationMap = new Map<string, any>();
      for (const s of stationsRaw) {
        const id = String(s.properties?.idEstacao || "");
        if (id) {
          stationMap.set(id, {
            name: s.properties?.localEstacao,
            lat: s.geometry?.coordinates?.[1],
            lon: s.geometry?.coordinates?.[0],
          });
        }
      }

      // Get most recent timestamp (observations are keyed by ISO timestamp)
      const timestamps = Object.keys(obsRaw).sort().reverse();
      if (timestamps.length === 0) {
        throw new Error("No observation timestamps");
      }

      const latestTs = timestamps[0];
      const latestObs = obsRaw[latestTs] || {};

      const observations: WeatherObservation[] = [];
      for (const [stationId, obs] of Object.entries(latestObs)) {
        // IPMA may include station IDs with null observations (station offline, etc.)
        if (!obs || typeof obs !== "object") continue;
        const o = obs as any;
        const station = stationMap.get(stationId) || {};
        observations.push({
          stationId,
          stationName: station.name,
          stationLat: station.lat,
          stationLon: station.lon,
          timestamp: latestTs,
          temperature: o.temperatura ?? 0,
          humidity: o.humidade ?? 0,
          windSpeedKmh: o.intensidadeVentoKM ?? 0,
          windDirectionId: o.idDireccVento ?? 0,
          precipitation: o.precAcumulada ?? 0,
          radiation: o.radiacao ?? 0,
          pressure: o.pressao ?? 0,
        });
      }

      return {
        source: "ipma",
        fetchedAt: new Date().toISOString(),
        timestamp: latestTs,
        count: observations.length,
        observations,
      } as WeatherResponse;
    });

    return NextResponse.json(
      { ...result, cached: false, dataState: createDataStateMeta(classifyDataState({ count: result.count }), undefined, result.fetchedAt, result.source) },
      { headers: { "Cache-Control": "public, s-maxage=3600" } }
    );
  } catch (err: unknown) {
    logServerFailure("weather.fetch", err, { route: "/api/weather", retryable: true });
    return NextResponse.json(
      {
        source: "ipma",
        count: 0,
        observations: [],
        error: "Weather data is temporarily unavailable.",
        dataState: createDataStateMeta("retryable-error", "IPMA weather source unavailable"),
      },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}
