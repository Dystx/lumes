// Aggregated source health endpoint — reports status of all live data sources
// Useful for the UI's "live data" indicator
//
// IMPORTANT: probes hit the *actual* server port, not a hardcoded one.
// Earlier versions hardcoded 3000, which broke when the production server
// runs on 3001 (set in `.env` via PORT=3001).

import { NextResponse } from "next/server";
import type { SourceHealth } from "@/lib/types";
import { cached } from "@/lib/api/cache";
import { createDataStateMeta, type DataState } from "@/lib/data-state";

const PORT = process.env.PORT ?? "3000";
const HOST = process.env.SOURCE_HEALTH_HOST ?? "127.0.0.1";
const BASE = `http://${HOST}:${PORT}`;

async function probe(url: string, timeoutMs = 8000): Promise<{ status: number | null; latencyMs: number; recordCount: number; error: string | null; dataState?: string; source?: string }> {
  const start = Date.now();
  try {
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), timeoutMs);
    const r = await fetch(url, { signal: c.signal });
    clearTimeout(t);
    const txt = await r.text();
    let count = 0;
    try {
      const j = JSON.parse(txt);
      count = j.count ?? j.incidents?.length ?? j.records?.length ?? j.stations?.length ?? j.observations?.length ?? 0;
      return { status: r.status, latencyMs: Date.now() - start, recordCount: count, error: null, dataState: j.dataState?.state ?? j.dataState, source: j.source };
    } catch {}
    return { status: r.status, latencyMs: Date.now() - start, recordCount: count, error: null };
  } catch {
    return { status: null, latencyMs: Date.now() - start, recordCount: 0, error: "Source unavailable" };
  }
}

export async function GET() {
  const sources = await cached("source-health", 30_000, async () => {
    // Probe all sources in parallel to get real health status
    const [incidents, fireRisk, weather, fireStations, warnings, regionalCmds] = await Promise.all([
      probe(`${BASE}/api/incidents`),
      probe(`${BASE}/api/fire-risk`),
      probe(`${BASE}/api/weather`),
      probe(`${BASE}/api/fire-stations`, 15000),
      probe(`${BASE}/api/weather-warnings`),
      probe(`${BASE}/api/regional-commands`),
    ]);

    // NASA FIRMS — check if MAP_KEY is configured (don't probe, too slow)
    const firmsConfigured = !!process.env.FIRMS_MAP_KEY;
    const satelliteProbe = {
      status: firmsConfigured ? 200 : 503,
      latencyMs: 0,
      recordCount: firmsConfigured ? 1 : 0,
      error: firmsConfigured ? null : "FIRMS_MAP_KEY not configured",
    };

    const now = new Date().toISOString();
    const classify = (r: { status: number | null; recordCount: number; error: string | null; dataState?: string; source?: string }): "ok" | "stale" | "error" => {
      if (r.error) return "error";
      if (r.status !== 200) return "error";
      if (r.dataState === "fallback" || r.source?.endsWith("-fallback")) return "stale";
      if (r.recordCount === 0) return "stale";
      return "ok";
    };

    return [
      {
        sourceId: "anepc-prociv-arcgis",
        sourceName: "ANEPC Occurrences",
        status: classify(incidents),
        lastSuccess: classify(incidents) === "ok" ? now : null,
        lastError: incidents.error,
        recordCount: incidents.recordCount,
        latencyMs: incidents.latencyMs,
      },
      {
        sourceId: "ipma-fire-risk",
        sourceName: "IPMA Fire Risk",
        status: classify(fireRisk),
        lastSuccess: classify(fireRisk) === "ok" ? now : null,
        lastError: fireRisk.error,
        recordCount: fireRisk.recordCount,
        latencyMs: fireRisk.latencyMs,
      },
      {
        sourceId: "ipma-weather",
        sourceName: "IPMA Weather",
        status: classify(weather),
        lastSuccess: classify(weather) === "ok" ? now : null,
        lastError: weather.error,
        recordCount: weather.recordCount,
        latencyMs: weather.latencyMs,
      },
      {
        sourceId: "ipma-warnings",
        sourceName: "IPMA Warnings",
        status: classify(warnings),
        lastSuccess: classify(warnings) === "ok" ? now : null,
        lastError: warnings.error,
        recordCount: warnings.recordCount,
        latencyMs: warnings.latencyMs,
      },
      {
        sourceId: "anepc-regional-commands",
        sourceName: "ANEPC Regional Commands",
        status: classify(regionalCmds),
        lastSuccess: classify(regionalCmds) === "ok" ? now : null,
        lastError: regionalCmds.error,
        recordCount: regionalCmds.recordCount,
        latencyMs: regionalCmds.latencyMs,
      },
      {
        sourceId: "osm-fire-stations",
        sourceName: "OSM Fire Stations",
        status: classify(fireStations),
        lastSuccess: classify(fireStations) === "ok" ? now : null,
        lastError: fireStations.error,
        recordCount: fireStations.recordCount,
        latencyMs: fireStations.latencyMs,
      },
      {
        sourceId: "nasa-firms-viirs",
        sourceName: "NASA FIRMS Satellite",
        status: classify(satelliteProbe),
        lastSuccess: classify(satelliteProbe) === "ok" ? now : null,
        lastError: satelliteProbe.error,
        recordCount: satelliteProbe.recordCount,
        latencyMs: satelliteProbe.latencyMs,
      },
    ];
  });

  const now = new Date().toISOString();
  const dataState: DataState = sources.length === 0
    ? "empty"
    : sources.some((source) => source.status === "error")
      ? "retryable-error"
      : sources.some((source) => source.status === "stale")
        ? "stale"
        : "healthy";
  return NextResponse.json(
    {
      sources,
      fetchedAt: now,
      cached: false,
      dataState: createDataStateMeta(dataState, dataState === "healthy" ? undefined : "One or more sources need attention", now, "source-health"),
    },
    { headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60" } }
  );
}
