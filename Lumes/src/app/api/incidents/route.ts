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
  EventType,
  Severity,
  IncidentStatus,
  VerificationStatus,
} from "@/lib/types";

const ANEPC_FEATURE_SERVER =
  "https://services-eu1.arcgis.com/VlrHb7fn5ewYhX6y/arcgis/rest/services/OcorrenciasSite/FeatureServer/0/query";

interface CacheEntry {
  data: any;
  ts: number;
  status: "ok" | "error";
  error?: string;
  latencyMs: number;
}
let cache: CacheEntry | null = null;
const CACHE_TTL_MS = 60_000;
let fetchLock = false; // Prevents concurrent ANEPC fetches + DB persistence

function ptDateToISO(pt: string): string {
  if (!pt) return new Date().toISOString();
  const m = pt.match(/^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2})$/);
  if (!m) return new Date().toISOString();
  return `${m[3]}-${m[2]}-${m[1]}T${m[4]}:${m[5]}:00Z`;
}

function mapEventType(rasi: string): EventType {
  if (!rasi) return "other";
  if (rasi.includes("Rurais")) return "wildfire";
  if (rasi.includes("Urbanos")) return "urban_fire";
  if (rasi.includes("Outros Incêndios")) return "other_fire";
  return "other";
}

function mapIncidentStatus(estadoAgrupado: string): IncidentStatus {
  if (!estadoAgrupado) return "detected";
  if (estadoAgrupado.includes("Despacho")) return "detected";
  if (estadoAgrupado.includes("Curso")) return "active";
  if (estadoAgrupado.includes("Resolu")) return "contained";
  // "Em Conclusão" means "being concluded" — still active, not yet closed.
  // Only fully terminated states (Encerrada / Encerrado / Falso Alarme) are resolved.
  if (estadoAgrupado.includes("Encerrada") || estadoAgrupado.includes("Falso Alarme")) return "resolved";
  if (estadoAgrupado.includes("Conclu")) return "contained";
  if (estadoAgrupado.includes("Vigil")) return "monitoring";
  return "detected";
}

function mapSeverity(
  personnelTotal: number,
  assetsAerial: number,
  eventType: EventType,
  incidentStatus: IncidentStatus
): Severity {
  // First compute the "peak" severity based on resources deployed
  let peak: Severity;
  if (eventType === "wildfire") {
    if (assetsAerial >= 2 || personnelTotal >= 30) peak = "critical";
    else if (assetsAerial >= 1 || personnelTotal >= 15) peak = "high";
    else if (personnelTotal >= 5) peak = "medium";
    else peak = "low";
  } else if (eventType === "urban_fire") {
    if (personnelTotal >= 20) peak = "high";
    else if (personnelTotal >= 8) peak = "medium";
    else peak = "low";
  } else {
    if (personnelTotal >= 15) peak = "medium";
    else peak = "low";
  }

  // Downgrade severity based on current status — a resolved fire
  // should never show as "critical" even if it had 30+ personnel when active
  switch (incidentStatus) {
    case "resolved":
      // Resolved = fire is out, only show historical severity at most
      return peak === "critical" ? "medium" : peak === "high" ? "low" : "low";
    case "contained":
      // Contained = under control, downgrade by one level
      return peak === "critical" ? "high" : peak === "high" ? "medium" : peak === "medium" ? "low" : "low";
    case "monitoring":
      // Monitoring = watch, downgrade by one level
      return peak === "critical" ? "high" : peak === "high" ? "medium" : peak === "medium" ? "low" : "low";
    case "detected":
    case "active":
    default:
      // Active/detected = use peak severity (fire is still burning)
      return peak;
  }
}

function freshnessScore(observedAt: string): number {
  const ageHr = (Date.now() - new Date(observedAt).getTime()) / 3_600_000;
  return Math.max(0, 1 - ageHr / 24);
}

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

  if (cache && cache.data && Date.now() - cache.ts < CACHE_TTL_MS) {
    return NextResponse.json(
      { ...cache.data, cached: true, cacheAge: Math.round((Date.now() - cache.ts) / 1000) },
      { headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=120" } }
    );
  }

  // Prevent concurrent fetches — if another request is already fetching,
  // return stale cache (or wait briefly) instead of spawning another fetch
  if (fetchLock) {
    // Wait up to 5s for the in-flight fetch to complete
    for (let i = 0; i < 50; i++) {
      await new Promise((r) => setTimeout(r, 100));
      if (cache && cache.data && Date.now() - cache.ts < CACHE_TTL_MS * 5) {
        return NextResponse.json(
          { ...cache.data, cached: true, cacheAge: Math.round((Date.now() - cache.ts) / 1000) },
          { headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=120" } }
        );
      }
    }
  }
  fetchLock = true;

  const params = new URLSearchParams({
    f: "geojson",
    where: "RASI LIKE '%Incêndio%'",
    outFields: "*",
    returnGeometry: "true",
    resultRecordCount: "200",
    orderByFields: "DataOcorrencia DESC",
  });

  try {
    const res = await fetch(`${ANEPC_FEATURE_SERVER}?${params.toString()}`, {
      headers: {
        "User-Agent": "lumes.pt-Platform/0.1 (wildfire-intel; +contact@lumes.pt)",
        Accept: "application/json, application/geo+json",
        Referer: "https://ember.pt/",
      },
    });

    if (!res.ok) {
      const errText = await res.text();
      cache = {
        data: null, ts: Date.now(), status: "error",
        error: `ANEPC HTTP ${res.status}: ${errText.slice(0, 200)}`,
        latencyMs: Date.now() - start,
      };
      return NextResponse.json(
        { source: "anepc-prociv-arcgis", error: cache.error, fetchedAt: new Date().toISOString() },
        { status: 502 }
      );
    }

    const raw: any = await res.json();
    if (!raw.features || !Array.isArray(raw.features)) {
      cache = {
        data: null, ts: Date.now(), status: "error",
        error: "Unexpected ANEPC response (no features array)",
        latencyMs: Date.now() - start,
      };
      return NextResponse.json(
        { source: "anepc-prociv-arcgis", error: cache.error, fetchedAt: new Date().toISOString() },
        { status: 502 }
      );
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

    const result = {
      source: "anepc-prociv-arcgis",
      sourceType: "official",
      fetchedAt: new Date().toISOString(),
      totalRaw: raw.features.length,
      count: fireIncidents.length,
      distribution: { byType, byStatus },
      incidents: fireIncidents,
    };

    cache = { data: result, ts: Date.now(), status: "ok", latencyMs: Date.now() - start };

    // NOTE: persistence is no longer triggered from this endpoint.
    // The cron pipeline (scripts/ingest.ts or /api/cron/ingest) is
    // solely responsible for writing to the database.

    return NextResponse.json(
      { ...result, cached: false, latencyMs: cache.latencyMs },
      { headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=120" } }
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    cache = { data: null, ts: Date.now(), status: "error", error: msg, latencyMs: Date.now() - start };
    return NextResponse.json(
      { source: "anepc-prociv-arcgis", error: msg, fetchedAt: new Date().toISOString() },
      { status: 500 }
    );
  } finally {
    fetchLock = false;
  }
}
