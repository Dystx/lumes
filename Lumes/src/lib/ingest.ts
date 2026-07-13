// Ingest pipeline shared by the HTTP cron endpoint (`/api/cron/ingest`)
// and the standalone CLI (`scripts/ingest.ts`).
//
// Behaviour:
//   * Fetches the latest fire incidents from ANEPC ArcGIS FeatureServer.
//   * Normalises them to the `LiveIncident` shape used by the rest of
//     the codebase.
//   * Calls `persistIncidents(...)` to upsert into Prisma, creating
//     snapshots on state changes.
//
// This module is intentionally separate from `/api/incidents` (the
// read endpoint): the cron owns writes, the read endpoint owns reads.
// Originally the read endpoint did both, which meant every page load
// triggered 100+ SQL upserts — the perf bug that triggered this refactor.
//
// All callers should treat `runIngest` as a black box: HTTP, file,
// or scheduler-driven invocation runs the same code path.

import { persistIncidents } from "@/lib/persistence";
import type { LiveIncident } from "@/lib/types";
import { isFireIncident, normalizeANepcFeature, parseANepcFeatureCollection } from "@/lib/anepc";

const ANEPC_FEATURE_SERVER =
  "https://services-eu1.arcgis.com/VlrHb7fn5ewYhX6y/arcgis/rest/services/OcorrenciasSite/FeatureServer/0/query";

export interface IngestResult {
  source: string;
  fetchedAt: string;
  totalRaw: number;
  upserted: number;
  created: number;
  updated: number;
  snapshotsCreated: number;
  errors: string[];
  latencyMs: number;
}

/**
 * Run one ingest pass. Safe to call concurrently — Prisma transactions
 * serialise the writes. Will not throw on ANEPC failure; reports the
 * failure in `result.errors` and returns a zero-incident payload.
 */
export async function runIngest(): Promise<IngestResult> {
  const start = Date.now();

  const params = new URLSearchParams({
    f: "geojson",
    where: "RASI LIKE '%Incêndio%'",
    outFields: "*",
    returnGeometry: "true",
    resultRecordCount: "200",
    orderByFields: "DataOcorrencia DESC",
  });

  let totalRaw = 0;
  let fireIncidents: LiveIncident[] = [];
  let allowStaleResolution = false;
  const errors: string[] = [];

  try {
    const res = await fetch(`${ANEPC_FEATURE_SERVER}?${params.toString()}`, {
      headers: {
        "User-Agent": "lumes.pt-Platform/0.1 (wildfire-intel; +contact@lumes.pt)",
        Accept: "application/json, application/geo+json",
        Referer: "https://lumes.pt/",
      },
      // Bound upstream latency so a stuck ANEPC call doesn't pile up
      // back-to-back cron invocations.
      signal: AbortSignal.timeout(20_000),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "(no body)");
      errors.push(`ANEPC HTTP ${res.status}: ${errText.slice(0, 200)}`);
      return {
        source: "anepc-prociv-arcgis",
        fetchedAt: new Date().toISOString(),
        totalRaw: 0,
        upserted: 0,
        created: 0,
        updated: 0,
        snapshotsCreated: 0,
        errors,
        latencyMs: Date.now() - start,
      };
    }

    const parsed = parseANepcFeatureCollection(await res.json());
    if (!parsed) {
      errors.push("Unexpected ANEPC response (no features array)");
      return {
        source: "anepc-prociv-arcgis",
        fetchedAt: new Date().toISOString(),
        totalRaw: 0,
        upserted: 0,
        created: 0,
        updated: 0,
        snapshotsCreated: 0,
        errors,
        latencyMs: Date.now() - start,
      };
    }

    totalRaw = parsed.totalRaw;
    const all = parsed.features
      .map(normalizeANepcFeature)
      .filter((incident): incident is LiveIncident => incident !== null);
    fireIncidents = all.filter(isFireIncident);
    allowStaleResolution = parsed.features.length === parsed.totalRaw && all.length === fireIncidents.length;

    // Never pass an empty set to persistence: its stale-incident cleanup is a
    // write side effect and must not run after an empty or malformed provider
    // response. A non-empty raw payload with no valid features is reported so
    // operators can distinguish provider corruption from a legitimate empty
    // collection.
    if (fireIncidents.length === 0) {
      if (parsed.totalRaw > 0 && parsed.features.length === 0) {
        errors.push("ANEPC response contained no valid features");
      } else if (parsed.totalRaw > 0) {
        // A non-empty, valid payload that contains no fire event types means
        // the upstream query or schema may have drifted. Keep the write path
        // fail-closed, but surface the condition to health/cron consumers.
        errors.push("ANEPC response contained no fire incidents after normalization");
      }
      return {
        source: "anepc-prociv-arcgis",
        fetchedAt: new Date().toISOString(),
        totalRaw,
        upserted: 0,
        created: 0,
        updated: 0,
        snapshotsCreated: 0,
        errors,
        latencyMs: Date.now() - start,
      };
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    errors.push(`ANEPC fetch failed: ${msg}`);
    return {
      source: "anepc-prociv-arcgis",
      fetchedAt: new Date().toISOString(),
      totalRaw: 0,
      upserted: 0,
      created: 0,
      updated: 0,
      snapshotsCreated: 0,
      errors,
      latencyMs: Date.now() - start,
    };
  }

  // Persist only when incidents were returned.
  const persistResult = await persistIncidents(fireIncidents, {
    allowStaleResolution,
  });
  errors.push(...persistResult.errors);

  return {
    source: "anepc-prociv-arcgis",
    fetchedAt: new Date().toISOString(),
    totalRaw,
    upserted: persistResult.upserted,
    created: persistResult.created,
    updated: persistResult.updated,
    snapshotsCreated: persistResult.snapshotsCreated,
    errors,
    latencyMs: Date.now() - start,
  };
}
