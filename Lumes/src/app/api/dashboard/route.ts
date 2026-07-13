// Dashboard endpoint — aggregates live incident metrics in one round-trip.
//
// Strategy (in order of preference):
//   1. Call /api/incidents directly (most accurate, no DB lag)
//   2. Fall back to DB query filtered by firstDetected (stable, not bumped by re-ingest)
//      AND status != resolved (active incidents only)
//
// Cache: 60s in memory.

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { rankIncidents, dedupeByLocation } from "@/lib/incident";
import { cached } from "@/lib/api/cache";
import { createDataStateMeta } from "@/lib/data-state";
import { logServerFailure } from "@/lib/observability";
import type { DataState } from "@/lib/data-state";
import type {
  DashboardIncidentRecord,
  DashboardPriorityIncident,
  DashboardResponse,
  Severity,
} from "@/lib/types";
import { normalizeDashboardDbRow, normalizeDashboardIncident } from "@/lib/dashboard/normalizer";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const DATA_STATES = new Set<DataState>(["healthy", "stale", "fallback", "empty", "retryable-error"]);

function readDataState(value: unknown): DataState | undefined | null {
  if (value === undefined) return undefined;
  const state = typeof value === "string"
    ? value
    : isRecord(value) && typeof value.state === "string"
      ? value.state
      : null;
  return state !== null && DATA_STATES.has(state as DataState) ? state as DataState : null;
}

// Fetch live incidents from /api/incidents. Returns null on failure.
async function fetchLiveIncidents(): Promise<{ incidents: DashboardIncidentRecord[]; dataState?: DataState } | null> {
  // Internal calls are always plain HTTP — Caddy terminates TLS at the edge.
  // Using https://localhost would fail because the local Node process has no cert.
  const port = process.env.PORT ?? "3000";
  const host = process.env.SOURCE_HEALTH_HOST ?? `127.0.0.1:${port}`;
  try {
    const r = await fetch(`http://${host}/api/incidents`, {
      signal: AbortSignal.timeout(5_000),
      headers: { "x-internal-call": "dashboard" },
    });
    if (!r.ok) return null;
    const data: unknown = await r.json();
    if (!isRecord(data) || !Array.isArray(data.incidents)) return null;
    const dataState = readDataState(data.dataState);
    if (dataState === null || dataState === "retryable-error") return null;
    return {
      incidents: data.incidents
      .map(normalizeDashboardIncident)
      .filter((incident): incident is DashboardIncidentRecord => incident !== null),
      ...(dataState === undefined ? {} : { dataState }),
    };
  } catch {
    return null;
  }
}

// DB fallback: incidents first detected in the last 24h AND still active.
// `firstDetected` is stable (set from source data, not bumped by re-ingest).
async function fetchDbIncidents(): Promise<DashboardIncidentRecord[] | null> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  try {
    const rows = await db.incident.findMany({
      where: {
        firstDetected: { gte: since },
        status: { in: ["active", "detected", "contained", "monitoring"] },
      },
      select: {
        id: true, severity: true, status: true,
        municipality: true, district: true, parish: true,
        estimatedAreaHa: true, personnelTotal: true,
        assetsGround: true, assetsAerial: true,
        statusText: true, naturezaText: true, rasi: true,
        firstDetected: true, lastSeen: true,
        displayName: true, latitude: true, longitude: true,
      },
    });
    return rows
      .map(normalizeDashboardDbRow)
      .filter((incident): incident is DashboardIncidentRecord => incident !== null);
  } catch {
    return null;
  }
}

export async function GET() {
  try {
    const data = await cached("dashboard", 60_000, async () => {
      // Try live first (most accurate, ~25-30 incidents for Portugal)
      const liveResult = await fetchLiveIncidents();
      let incidents = liveResult?.incidents ?? null;
      let source = "anepc-prociv-arcgis-live";
      let dataState: DataState = liveResult?.dataState ?? "healthy";

      if (!incidents || incidents.length === 0 || dataState === "empty") {
        // Fallback: DB query with stable filters
        const dbIncidents = await fetchDbIncidents();
        if (dbIncidents === null) throw new Error("Dashboard database fallback unavailable");
        incidents = dbIncidents;
        source = "anepc-prociv-arcgis-db";
        dataState = incidents.length > 0 ? "fallback" : "empty";
      }

      // ---------- summary ----------
      const total = incidents.length;
      const active = incidents.filter(
        (i) => i.incidentStatus === "active" || i.incidentStatus === "detected"
      );
      const critical = incidents.filter((i) => i.severity === "critical");
      const high = incidents.filter((i) => i.severity === "high");

      const personnel = incidents.reduce(
        (s, i) => s + (i.properties?.personnelTotal ?? 0), 0
      );
      const aircraft = incidents.reduce(
        (s, i) => s + (i.properties?.assetsAerial ?? 0), 0
      );
      const engines = incidents.reduce(
        (s, i) => s + (i.properties?.assetsGround ?? 0), 0
      );
      const areaHa = incidents.reduce(
        (s, i) => s + (i.estimatedAreaHa || 0), 0
      );

      // ---------- distributions ----------
      const byType: Record<string, number> = {};
      const byStatus: Record<string, number> = {};
      const byStatusGroup: Record<string, number> = {};
      for (const inc of incidents) {
        const t = inc.properties?.naturezaText || inc.properties?.rasi || "other";
        byType[t] = (byType[t] || 0) + 1;
        const s = inc.incidentStatus || "unknown";
        byStatus[s] = (byStatus[s] || 0) + 1;
        const g = inc.properties?.statusGroup || inc.incidentStatus || "unknown";
        byStatusGroup[g] = (byStatusGroup[g] || 0) + 1;
      }

      // ---------- top 5 priority ----------
      // Use shared ranker (TASK A) + dedupe near-coincident markers (~50m)
      const ranked = rankIncidents(dedupeByLocation(incidents, 0.001)).slice(0, 5);

      const topPriority: DashboardPriorityIncident[] = ranked.map((inc) => ({
        id: inc.id,
        displayName: inc.displayName ?? inc.properties?.displayName ?? inc.municipality ?? inc.id,
        severity: inc.severity === "critical" || inc.severity === "high" || inc.severity === "medium" || inc.severity === "low"
          ? inc.severity
          : "low" as Severity,
        status: inc.incidentStatus ?? inc.status ?? "unknown",
        municipality: inc.municipality ?? inc.properties?.municipality ?? null,
        district: inc.district ?? inc.properties?.region ?? null,
        estimatedAreaHa: inc.estimatedAreaHa || 0,
        personnel: inc.properties?.personnelTotal ?? 0,
        firstDetected: inc.firstDetected,
        latitude: inc.geometry?.coordinates?.[1] ?? inc.properties?.latitude ?? null,
        longitude: inc.geometry?.coordinates?.[0] ?? inc.properties?.longitude ?? null,
      }));

      // ---------- persistence stats (overall) ----------
      let persistence: { total: number; active: number; resolved: number; snapshots: number } | null = null;
      try {
        const [totalDb, activeDb, resolvedDb, snapshotsDb] = await Promise.all([
          db.incident.count(),
          db.incident.count({ where: { status: { in: ["active", "detected", "contained"] } } }),
          db.incident.count({ where: { status: "resolved" } }),
          db.incidentSnapshot.count(),
        ]);
        persistence = { total: totalDb, active: activeDb, resolved: resolvedDb, snapshots: snapshotsDb };
      } catch {
        // optional
      }

      return {
        source,
        dataState,
        fetchedAt: new Date().toISOString(),
        summary: {
          total, activeCount: active.length,
          criticalCount: critical.length, highCount: high.length,
          personnel, aircraft, engines, areaHa,
        },
        distribution: {
          byType: Object.entries(byType).sort((a, b) => b[1] - a[1]).slice(0, 8).reduce((acc, [k, v]) => ({ ...acc, [k]: v }), {}),
          byStatus,
          byStatusGroup,
        },
        topPriority,
        persistence,
      };
    });

    const body: DashboardResponse = {
      ...data,
      dataState: createDataStateMeta(
        data.dataState,
        data.dataState === "fallback" ? "Live incident source unavailable; showing stored incident data" : undefined,
        data.fetchedAt,
        data.source,
      ),
    };
    return NextResponse.json(body, {
      headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=120" },
    });
  } catch (err: unknown) {
    logServerFailure("dashboard.fetch", err, { route: "/api/dashboard", retryable: true });
    return NextResponse.json({
      error: "Dashboard data is temporarily unavailable.",
      dataState: createDataStateMeta("retryable-error", "Dashboard aggregation failed"),
    }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
