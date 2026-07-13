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
import { classifySource, deriveHeadlineTrust, type SourceTrustStatus } from "@/lib/source-trust";
import { logServerFailure } from "@/lib/observability";
import { normalizeSourceHealthPayload } from "@/lib/source-health-probe";

const PORT = process.env.PORT ?? "3000";
const HOST = process.env.SOURCE_HEALTH_HOST ?? "127.0.0.1";
const BASE = `http://${HOST}:${PORT}`;

async function probe(url: string, timeoutMs = 8000): Promise<{
  status: number | null;
  latencyMs: number;
  recordCount: number;
  error: string | null;
  dataState?: DataState | "disabled";
  reason?: string;
  source?: string;
  sourceNote?: string;
  sourceUpdatedAt?: string | null;
}> {
  const start = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (response.status !== 200) {
      return {
        status: response.status,
        latencyMs: Date.now() - start,
        recordCount: 0,
        error: `Source returned HTTP ${response.status}`,
      };
    }

    let payload: unknown;
    try {
      payload = JSON.parse(await response.text()) as unknown;
    } catch {
      return {
        status: response.status,
        latencyMs: Date.now() - start,
        recordCount: 0,
        error: "Invalid source response",
      };
    }

    const normalized = normalizeSourceHealthPayload(payload);
    if (!normalized) {
      return {
        status: response.status,
        latencyMs: Date.now() - start,
        recordCount: 0,
        error: "Invalid source response",
      };
    }

    return {
      status: response.status,
      latencyMs: Date.now() - start,
      recordCount: normalized.recordCount,
      error: null,
      dataState: normalized.dataState,
      reason: normalized.reason,
      source: normalized.source,
      sourceNote: normalized.sourceNote,
      sourceUpdatedAt: normalized.sourceUpdatedAt,
    };
  } catch {
    return { status: null, latencyMs: Date.now() - start, recordCount: 0, error: "Source unavailable" };
  } finally {
    clearTimeout(timeout);
  }
}

type ProbeResult = Awaited<ReturnType<typeof probe>>;

function classifyStatus(r: ProbeResult): SourceHealth["status"] {
  if (r.error || r.status !== 200) return "error";
  if (r.dataState === "disabled") return "disabled";
  if (r.dataState === "retryable-error") return "error";
  if (r.dataState === "fallback" || r.dataState === "stale" || r.dataState === "empty" || r.source?.endsWith("-fallback") || r.recordCount === 0) return "stale";
  return "ok";
}

function classifyTrustState(r: ProbeResult, status: SourceHealth["status"]): SourceTrustStatus {
  if (status === "disabled") return "disabled";
  if (status === "ok") return "healthy";
  if (r.dataState === "fallback" || r.source?.endsWith("-fallback")) return "fallback";
  if (status === "stale") return "stale";
  return "error";
}

function sourceHealthEntry(
  sourceId: string,
  sourceName: string,
  result: ProbeResult,
  receivedAt: string,
): SourceHealth {
  const status = classifyStatus(result);
  const state = classifyTrustState(result, status);
  return {
    sourceId,
    sourceName,
    status,
    tier: classifySource(sourceId),
    state,
    dataState: state === "error" ? "retryable-error" : state,
    lastSuccess: state === "healthy" ? receivedAt : null,
    lastError: result.error ?? result.sourceNote ?? result.reason ?? null,
    recordCount: result.recordCount,
    latencyMs: result.latencyMs,
    sourceUpdatedAt: result.sourceUpdatedAt ?? null,
    receivedAt,
  };
}

function disabledSource(sourceId: string, sourceName: string, receivedAt: string, reason: string): SourceHealth {
  return {
    sourceId,
    sourceName,
    status: "disabled",
    tier: classifySource(sourceId),
    state: "disabled",
    dataState: "disabled",
    lastSuccess: null,
    lastError: reason,
    recordCount: 0,
    latencyMs: null,
    sourceUpdatedAt: null,
    receivedAt,
  };
}

export async function GET() {
  let sources: SourceHealth[];
  try {
    sources = await cached("source-health", 30_000, async () => {
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
        sourceUpdatedAt: null,
      };

      const now = new Date().toISOString();
      return [
        sourceHealthEntry("anepc-prociv-arcgis", "ANEPC Occurrences", incidents, now),
        sourceHealthEntry("ipma-fire-risk", "IPMA Fire Risk", fireRisk, now),
        sourceHealthEntry("ipma-weather", "IPMA Weather", weather, now),
        sourceHealthEntry("ipma-warnings", "IPMA Warnings", warnings, now),
        sourceHealthEntry("anepc-regional-commands", "ANEPC Regional Commands", regionalCmds, now),
        sourceHealthEntry("osm-fire-stations", "OSM Fire Stations", fireStations, now),
        sourceHealthEntry("nasa-firms-viirs", "NASA FIRMS Satellite", satelliteProbe, now),
        disabledSource("aerial-adsb", "Aerial activity", now, "Loaded when the aerial layer is enabled"),
        disabledSource("biomass", "Biomass model", now, "Loaded when the biomass layer is enabled"),
      ];
    });
  } catch (err: unknown) {
    logServerFailure("source-health.fetch", err, { route: "/api/source-health", retryable: true });
    const fetchedAt = new Date().toISOString();
    return NextResponse.json(
      {
        sources: [],
        fetchedAt,
        cached: false,
        dataState: createDataStateMeta("retryable-error", "Source health aggregation unavailable", fetchedAt, "core"),
      },
      { status: 502, headers: { "Cache-Control": "no-store" } },
    );
  }

  const now = new Date().toISOString();
  const headlineTrust = deriveHeadlineTrust(sources.map((source) => ({
    sourceId: source.sourceId,
    tier: source.tier ?? classifySource(source.sourceId),
    state: source.state ?? (source.status === "ok" ? "healthy" : source.status === "stale" ? "stale" : source.status === "disabled" ? "disabled" : "error"),
    reason: source.lastError,
    sourceUpdatedAt: source.sourceUpdatedAt ?? null,
  })));
  const dataState: DataState = headlineTrust.state === "fresh" || headlineTrust.state === "updating"
    ? "healthy"
    : headlineTrust.state === "error"
      ? "retryable-error"
      : headlineTrust.state;
  return NextResponse.json(
    {
      sources,
      fetchedAt: now,
      cached: false,
      dataState: createDataStateMeta(
        dataState,
        headlineTrust.reason ?? (dataState === "healthy" ? undefined : "One or more core sources need attention"),
        headlineTrust.sourceUpdatedAt ?? undefined,
        "core",
      ),
    },
    { headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60" } }
  );
}
