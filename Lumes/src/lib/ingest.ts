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
// All callers should treat `runIngest` as a black box: any HTTP, file,
// or scheduler-driven invocation runs the same code path.

import { persistIncidents } from "@/lib/persistence";
import type { LiveIncident } from "@/lib/types";
import {
  ptDateToISO,
  mapEventType,
  mapIncidentStatus,
  mapSeverity,
  freshnessScore,
} from "@/lib/incident";

const ANEPC_FEATURE_SERVER =
  "https://services-eu1.arcgis.com/VlrHb7fn5ewYhX6y/arcgis/rest/services/OcorrenciasSite/FeatureServer/0/query";

interface RawANepcProps {
  ID_oc: number;
  Numero: string;
  CodEstadoOcorrencia: number;
  EstadoOcorrencia: string;
  EstadoAgrupado: string;
  DataInicioOcorrencia: string;
  RASI: string;
  Natureza: string;
  Regiao: string;
  SubRegiao: string;
  Concelho: string;
  Freguesia: string;
  Localidade: string;
  Endereco: string;
  OperacionaisTerrestres: number;
  OPAereos: number;
  Operacionais: number;
  MeiosTerrestres: number;
  MeiosAereos: number;
  Latitude: number;
  Longitude: number;
  DuracaoMinutos: number;
}

interface RawANepcFeature {
  type: "Feature";
  geometry: { type: "Point"; coordinates: [number, number] };
  properties: RawANepcProps;
}

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

// ptDateToISO, mapEventType, mapIncidentStatus, mapSeverity, freshnessScore
// are now imported from @/lib/incident (unified)

function normalizeFeature(f: RawANepcFeature): LiveIncident {
  const p = f.properties;
  const rasi = p.RASI || "";
  const eventType = mapEventType(rasi);
  const incidentStatus = mapIncidentStatus(p.EstadoAgrupado);
  const severity = mapSeverity(
    p.Operacionais || 0,
    p.MeiosAereos || 0,
    eventType,
    incidentStatus
  );
  const observedAt = ptDateToISO(p.DataInicioOcorrencia);
  const freshness = freshnessScore(observedAt);
  const confidence = 0.92 * freshness + 0.05;
  const displayName = p.Localidade || p.Concelho || p.Freguesia || `Ocorrência ${p.Numero || p.ID_oc}`;

  return {
    id: `anepc-${p.ID_oc}`,
    sourceId: "anepc-prociv-arcgis",
    sourceInternalId: String(p.ID_oc),
    observedAt,
    ingestedAt: new Date().toISOString(),
    geometry: { type: "Point", coordinates: [p.Longitude, p.Latitude] },
    sourceType: "official",
    properties: {
      numero: p.Numero,
      statusCode: p.CodEstadoOcorrencia,
      statusText: p.EstadoOcorrencia,
      statusGroup: p.EstadoAgrupado,
      rasi,
      naturezaText: p.Natureza,
      localidade: p.Localidade,
      endereco: p.Endereco,
      municipality: p.Concelho,
      parish: p.Freguesia,
      region: p.Regiao,
      subregion: p.SubRegiao,
      personnelTotal: p.Operacionais,
      personnelGround: p.OperacionaisTerrestres,
      personnelAerial: p.OPAereos,
      assetsGround: p.MeiosTerrestres,
      assetsAerial: p.MeiosAereos,
      durationMinutes: p.DuracaoMinutos,
    },
    trust: {
      confidence,
      sourceReputation: 0.95,
      verificationStatus: "officially-verified",
      corroborationCount: 0,
      freshnessScore: freshness,
    },
    eventType,
    incidentStatus,
    severity,
    displayName: `${displayName} (${p.Concelho || "—"})`,
    estimatedAreaHa: 0,
    firstDetected: observedAt,
    lastUpdated: observedAt,
  };
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

    const raw: any = await res.json();
    if (!raw.features || !Array.isArray(raw.features)) {
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

    totalRaw = raw.features.length;
    const all = raw.features.map(normalizeFeature);
    fireIncidents = all.filter(
      (i) => i.eventType === "wildfire" || i.eventType === "urban_fire" || i.eventType === "other_fire"
    );
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

  // Persist (only if we got any incidents to persist)
  const persistResult = await persistIncidents(fireIncidents);
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
