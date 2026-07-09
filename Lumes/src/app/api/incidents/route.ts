// ANEPC connector — fetches live occurrences from Prociv ArcGIS Online
// Normalizes to Ember Event schema, caches 60s server-side.
//
// IMPORTANT: this endpoint is a pure READ path. Persistence to Prisma is
// owned by the cron-driven ingest pipeline (`scripts/ingest.ts` or the
// HTTP cron endpoint `/api/cron/ingest`). The original "every page load
// triggers 100+ SQL queries" bug was caused by persisting here on every
// request; that work has been moved out.

import { NextResponse } from "next/server";
import type {
  LiveIncident,
  VerificationStatus,
} from "@/lib/types";
import {
  ptDateToISO,
  mapEventType,
  mapIncidentStatus,
  mapSeverity,
  freshnessScore,
} from "@/lib/incident";
import { cached } from "@/lib/api/cache";
import { classifyDataState, createDataStateMeta } from "@/lib/data-state";
import { logServerFailure } from "@/lib/observability";

const ANEPC_FEATURE_SERVER =
  "https://services-eu1.arcgis.com/VlrHb7fn5ewYhX6y/arcgis/rest/services/OcorrenciasSite/FeatureServer/0/query";

let fetchLock = false; // Prevents concurrent ANEPC fetches + DB persistence

// Normalization functions are now shared from @/lib/incident (ptDateToISO, map*, freshnessScore)

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
  const verificationStatus: VerificationStatus = "officially-verified";
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
      verificationStatus,
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

export async function GET() {
  const start = Date.now();

  // Prevent concurrent fetches — if another request is already fetching,
  // wait briefly instead of spawning another fetch (central cache will
  // serve the result once the in-flight load completes).
  if (fetchLock) {
    // Wait up to 5s for the in-flight fetch to complete
    for (let i = 0; i < 50; i++) {
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  fetchLock = true;

  try {
    const result = await cached("incidents-anepc", 60_000, async () => {
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
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`ANEPC HTTP ${res.status}: ${errText.slice(0, 200)}`);
      }

      const raw: any = await res.json();
      if (!raw.features || !Array.isArray(raw.features)) {
        throw new Error("Unexpected ANEPC response (no features array)");
      }

      const allIncidents = raw.features.map(normalizeFeature);
      const fireIncidents = allIncidents.filter(
        (i) => i.eventType === "wildfire" || i.eventType === "urban_fire" || i.eventType === "other_fire"
      );

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
        totalRaw: raw.features.length,
        count: fireIncidents.length,
        distribution: { byType, byStatus },
        incidents: fireIncidents,
      };
    });

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
  } finally {
    fetchLock = false;
  }
}
