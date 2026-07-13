// ANEPC connector — fetches live occurrences from Prociv ArcGIS Online
// Normalizes to Ember Event schema, caches 60s server-side.
//
// IMPORTANT: this endpoint is a pure READ path. Persistence to Prisma is
// owned by the cron-driven ingest pipeline (`scripts/ingest.ts` or the
// HTTP cron endpoint `/api/cron/ingest`). The original "every page load
// triggers 100+ SQL queries" bug was caused by persisting here on every
// request; that work has been moved out.

import { NextResponse } from "next/server";
import { isFireIncident, normalizeANepcFeature, parseANepcFeatureCollection } from "@/lib/anepc";
import type { LiveIncident } from "@/lib/types";
import { cached } from "@/lib/api/cache";
import { classifyDataState, createDataStateMeta } from "@/lib/data-state";
import { logServerFailure } from "@/lib/observability";

const ANEPC_FEATURE_SERVER =
  "https://services-eu1.arcgis.com/VlrHb7fn5ewYhX6y/arcgis/rest/services/OcorrenciasSite/FeatureServer/0/query";

interface IncidentCachePayload {
  source: string;
  sourceType: string;
  fetchedAt: string;
  totalRaw: number;
  count: number;
  distribution: {
    byType: Record<string, number>;
    byStatus: Record<string, number>;
  };
  incidents: LiveIncident[];
}

let inFlightFetch: Promise<IncidentCachePayload> | null = null;

// Normalization functions are now shared from @/lib/incident (ptDateToISO, map*, freshnessScore)

function loadIncidentPayload(): Promise<IncidentCachePayload> {
  if (inFlightFetch) return inFlightFetch;

  const request = cached<IncidentCachePayload>("incidents-anepc", 60_000, async () => {
      const params = new URLSearchParams({
        f: "geojson",
        where: "RASI LIKE '%Incêndio%'",
        outFields: "*",
        returnGeometry: "true",
        resultRecordCount: "200",
        orderByFields: "DataOcorrencia DESC",
      });

      const res = await fetch(`${ANEPC_FEATURE_SERVER}?${params.toString()}`, {
        headers: {
          "User-Agent": "lumes.pt-Platform/0.1 (wildfire-intel; +contact@lumes.pt)",
          Accept: "application/json, application/geo+json",
          Referer: "https://ember.pt/",
        },
        signal: AbortSignal.timeout(20_000),
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`ANEPC HTTP ${res.status}: ${errText.slice(0, 200)}`);
      }

      const parsed = parseANepcFeatureCollection(await res.json());
      if (!parsed) {
        throw new Error("Unexpected ANEPC response (no features array)");
      }

      const allIncidents = parsed.features
        .map(normalizeANepcFeature)
        .filter((incident): incident is LiveIncident => incident !== null);
      const fireIncidents = allIncidents.filter(isFireIncident);

      const byType = fireIncidents.reduce(
        (acc, i) => { acc[i.eventType] = (acc[i.eventType] || 0) + 1; return acc; },
        {} as Record<string, number>
      );
      const byStatus = fireIncidents.reduce(
        (acc, i) => { acc[i.incidentStatus] = (acc[i.incidentStatus] || 0) + 1; return acc; },
        {} as Record<string, number>
      );

      return {
        source: "anepc-prociv-arcgis",
        sourceType: "official",
        fetchedAt: new Date().toISOString(),
        totalRaw: parsed.totalRaw,
        count: fireIncidents.length,
        distribution: { byType, byStatus },
        incidents: fireIncidents,
      };

  });

  inFlightFetch = request;
  void request.then(
    () => {
      if (inFlightFetch === request) inFlightFetch = null;
    },
    () => {
      if (inFlightFetch === request) inFlightFetch = null;
    },
  );

  return request;
}

export async function GET() {
  const start = Date.now();

  try {
    const result = await loadIncidentPayload();

    // NOTE: persistence is no longer triggered from this endpoint.
    // The cron pipeline (scripts/ingest.ts or /api/cron/ingest) is
    // solely responsible for writing to the database.

    return NextResponse.json(
      {
        ...result,
        cached: false,
        latencyMs: Date.now() - start,
        dataState: createDataStateMeta(classifyDataState({ count: result.count }), undefined, result.fetchedAt, result.source),
      },
      { headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=120" } }
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    const status = msg.includes("ANEPC HTTP") || msg.includes("Unexpected ANEPC") ? 502 : 500;
    logServerFailure("incidents.fetch", err, { route: "/api/incidents", retryable: true });
    return NextResponse.json(
      {
        source: "anepc-prociv-arcgis",
        count: 0,
        incidents: [],
        error: "Live incident data is temporarily unavailable.",
        dataState: createDataStateMeta("retryable-error", "ANEPC source unavailable"),
      },
      { status, headers: { "Cache-Control": "no-store" } }
    );
  }
}
