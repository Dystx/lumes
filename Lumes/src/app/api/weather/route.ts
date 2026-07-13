// IPMA weather observations connector — current conditions from 222 stations
// 1h cache

import { NextResponse } from "next/server";
import type { WeatherResponse, WeatherObservation } from "@/lib/types";
import { cached } from "@/lib/api/cache";
import { classifyDataState, createDataStateMeta } from "@/lib/data-state";
import { logServerFailure } from "@/lib/observability";
import { normalizeWeatherObservation } from "@/lib/weather/normalizer";
import {
  observationTimestampToISOString,
  selectLatestObservationTimestamp,
} from "@/lib/weather/observations";

const OBS_URL = "https://api.ipma.pt/open-data/observation/meteorology/stations/observations.json";
const STATIONS_URL = "https://api.ipma.pt/open-data/observation/meteorology/stations/stations.json";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function optionalFiniteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function isPortugalStationCoordinate(latitude: number, longitude: number): boolean {
  return latitude >= 36.95 && latitude <= 42.15 && longitude >= -9.5 && longitude <= -6;
}

export async function GET() {
  try {
    const result = await cached("weather", 60 * 60 * 1000, async () => {
      // Fetch observations + station metadata in parallel
      const [obsRes, stationsRes] = await Promise.all([
        fetch(OBS_URL, {
          headers: { "User-Agent": "lumes.pt-Platform/0.1", Accept: "application/json" },
          signal: AbortSignal.timeout(10_000),
        }),
        fetch(STATIONS_URL, {
          headers: { "User-Agent": "lumes.pt-Platform/0.1", Accept: "application/json" },
          signal: AbortSignal.timeout(10_000),
        }),
      ]);

      if (!obsRes.ok || !stationsRes.ok) {
        throw new Error(`IPMA HTTP obs:${obsRes.status} stations:${stationsRes.status}`);
      }

      const rawObservations: unknown = await obsRes.json();
      const rawStations: unknown = await stationsRes.json();
      const obsRaw = isRecord(rawObservations) ? rawObservations : {};
      const stationsRaw = Array.isArray(rawStations) ? rawStations : [];

      // Build station lookup
      const stationMap = new Map<string, { name?: string; lat?: number; lon?: number }>();
      for (const s of stationsRaw) {
        if (!isRecord(s)) continue;
        const properties = isRecord(s.properties) ? s.properties : {};
        const geometry = isRecord(s.geometry) ? s.geometry : {};
        const coordinates = Array.isArray(geometry.coordinates) ? geometry.coordinates : [];
        const id = typeof properties.idEstacao === "string" || typeof properties.idEstacao === "number"
          ? String(properties.idEstacao)
          : "";
        if (id) {
          const latitude = optionalFiniteNumber(coordinates[1]);
          const longitude = optionalFiniteNumber(coordinates[0]);
          const hasValidLocation = latitude !== undefined
            && longitude !== undefined
            && isPortugalStationCoordinate(latitude, longitude);
          stationMap.set(id, {
            name: typeof properties.localEstacao === "string" ? properties.localEstacao : undefined,
            lat: hasValidLocation ? latitude : undefined,
            lon: hasValidLocation ? longitude : undefined,
          });
        }
      }

      // Get most recent valid timestamp (observations are keyed by ISO timestamp).
      const latestTs = selectLatestObservationTimestamp(obsRaw);
      if (latestTs === null) {
        return {
          source: "ipma",
          fetchedAt: new Date().toISOString(),
          timestamp: "",
          count: 0,
          observations: [],
        } satisfies WeatherResponse;
      }

      const latestObs = isRecord(obsRaw[latestTs]) ? obsRaw[latestTs] : {};

      const observations: WeatherObservation[] = [];
      for (const [stationId, obs] of Object.entries(latestObs)) {
        // IPMA may include station IDs with null observations (station offline, etc.)
        if (!isRecord(obs)) continue;
        const o = obs;
        const station = stationMap.get(stationId) || {};
        const normalized = normalizeWeatherObservation({
          stationId,
          stationName: station.name,
          stationLat: station.lat,
          stationLon: station.lon,
          timestamp: latestTs,
          raw: o,
        });
        if (normalized) observations.push(normalized);
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
      {
        ...result,
        cached: false,
        dataState: createDataStateMeta(
          classifyDataState({ count: result.count }),
          result.count === 0 ? "No valid IPMA weather observations" : undefined,
          observationTimestampToISOString(result.timestamp) ?? undefined,
          result.source,
        ),
      },
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
