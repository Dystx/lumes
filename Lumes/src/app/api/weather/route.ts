// IPMA weather observations connector — current conditions from 222 stations
// 1h cache

import { NextResponse } from "next/server";
import type { WeatherResponse, WeatherObservation } from "@/lib/types";

const OBS_URL = "https://api.ipma.pt/open-data/observation/meteorology/stations/observations.json";
const STATIONS_URL = "https://api.ipma.pt/open-data/observation/meteorology/stations/stations.json";

interface CacheEntry {
  data: WeatherResponse | null;
  ts: number;
  status: "ok" | "error";
  error?: string;
}
let cache: CacheEntry | null = null;
const CACHE_TTL_MS = 60 * 60 * 1000;

export async function GET() {
  if (cache && cache.data && Date.now() - cache.ts < CACHE_TTL_MS) {
    return NextResponse.json(
      { ...cache.data, cached: true, cacheAge: Math.round((Date.now() - cache.ts) / 1000) },
      { headers: { "Cache-Control": "public, s-maxage=3600" } }
    );
  }

  try {
    // Fetch observations + station metadata in parallel
    const [obsRes, stationsRes] = await Promise.all([
      fetch(OBS_URL, { headers: { "User-Agent": "lumes.pt-Platform/0.1", Accept: "application/json" } }),
      fetch(STATIONS_URL, { headers: { "User-Agent": "lumes.pt-Platform/0.1", Accept: "application/json" } }),
    ]);

    if (!obsRes.ok || !stationsRes.ok) {
      cache = { data: null, ts: Date.now(), status: "error", error: `IPMA HTTP obs:${obsRes.status} stations:${stationsRes.status}` };
      return NextResponse.json(
        { source: "ipma", error: cache.error, fetchedAt: new Date().toISOString() },
        { status: 502 }
      );
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
      cache = { data: null, ts: Date.now(), status: "error", error: "No observation timestamps" };
      return NextResponse.json(
        { source: "ipma", error: cache.error, fetchedAt: new Date().toISOString() },
        { status: 502 }
      );
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

    const result: WeatherResponse = {
      source: "ipma",
      fetchedAt: new Date().toISOString(),
      timestamp: latestTs,
      count: observations.length,
      observations,
    };

    cache = { data: result, ts: Date.now(), status: "ok" };

    return NextResponse.json(
      { ...result, cached: false },
      { headers: { "Cache-Control": "public, s-maxage=3600" } }
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    cache = { data: null, ts: Date.now(), status: "error", error: msg };
    return NextResponse.json(
      { source: "ipma", error: msg, fetchedAt: new Date().toISOString() },
      { status: 500 }
    );
  }
}
