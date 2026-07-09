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

const SEVERITY_RANK: Record<string, number> = {
  critical: 0, high: 1, medium: 2, low: 3,
};
const STATUS_RANK: Record<string, number> = {
  active: 0, detected: 1, monitoring: 2, contained: 3, resolved: 4,
};

// Coarse group from the raw status text (used when statusGroup is not persisted).
// Implementation lives in src/lib/incident.ts as mapStatusGroup().
import { mapStatusGroup as toStatusGroup } from "@/lib/incident";

// Fetch live incidents from /api/incidents. Returns null on failure.
async function fetchLiveIncidents(): Promise<any[] | null> {
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
    const data = await r.json();
    return Array.isArray(data.incidents) ? data.incidents : null;
  } catch {
    return null;
  }
}

// DB fallback: incidents first detected in the last 24h AND still active.
// `firstDetected` is stable (set from source data, not bumped by re-ingest).
async function fetchDbIncidents(): Promise<any[]> {
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
    return rows.map((row) => {
      const properties = {
        statusText: row.statusText ?? undefined,
        statusGroup: toStatusGroup(row.statusText, row.status),
        naturezaText: row.naturezaText ?? undefined,
        rasi: row.rasi ?? undefined,
        personnelTotal: row.personnelTotal,
        assetsGround: row.assetsGround,
        assetsAerial: row.assetsAerial,
        municipality: row.municipality ?? undefined,
        region: row.district ?? undefined,
        parish: row.parish ?? undefined,
        latitude: row.latitude,
        longitude: row.longitude,
        displayName: row.displayName,
      };
      return {
        id: row.id,
        severity: row.severity,
        incidentStatus: row.status,
        estimatedAreaHa: row.estimatedAreaHa ?? 0,
        firstDetected: row.firstDetected?.toISOString(),
        properties,
        municipality: row.municipality,
        district: row.district,
        parish: row.parish,
      };
    });
  } catch {
    return [];
  }
}

export async function GET() {
  try {
    const data = await cached("dashboard", 60_000, async () => {
      // Try live first (most accurate, ~25-30 incidents for Portugal)
      let incidents = await fetchLiveIncidents();
      let source = "anepc-prociv-arcgis-live";
      let dataState: DataState = "healthy";

      if (!incidents || incidents.length === 0) {
        // Fallback: DB query with stable filters
        incidents = await fetchDbIncidents();
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
      const ranked = rankIncidents(
        dedupeByLocation(incidents as any[], 0.001),
      ).slice(0, 5);

      const topPriority = ranked.map((inc: any) => ({
        id: inc.id,
        displayName: inc.displayName ?? inc.properties?.displayName ?? inc.municipality ?? inc.id,
        severity: inc.severity,
        status: inc.incidentStatus,
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

    return NextResponse.json({
      ...data,
      dataState: createDataStateMeta(
        data.dataState,
        data.dataState === "fallback" ? "Live incident source unavailable; showing stored incident data" : undefined,
        data.fetchedAt,
        data.source,
      ),
    }, {
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
