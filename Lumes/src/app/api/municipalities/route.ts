// List of municipalities with active incidents. Drives the
// per-region navigation and analytics.
//
// Returns: sorted unique (municipality, district, count) tuples
// for any incident seen in the last 30 d, regardless of current
// status — so a Spanish user browsing can see where the site
// actually has data.

import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ACTIVE_STATUSES = ["detected", "active", "contained", "monitoring"];

export async function GET() {
  // Single-pass aggregate over the recent incidents table.
  const recent = await db.incident.findMany({
    where: {
      lastSeen: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
      municipality: { not: null },
    },
    select: {
      id: true,
      municipality: true,
      district: true,
      status: true,
      severity: true,
      lastUpdated: true,
    },
    orderBy: { lastUpdated: "desc" },
  });

  const agg = new Map<string, {
    municipality: string;
    district: string | null;
    active: number;
    total: number;
    worstSeverity: "critical" | "high" | "medium" | "low";
    lastUpdate: string;
  }>();
  const rank: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };

  for (const i of recent) {
    const key = `${(i.municipality ?? "").toLowerCase()}|${(i.district ?? "").toLowerCase()}`;
    const cur = agg.get(key);
    const isActive = ACTIVE_STATUSES.includes(i.status ?? "");
    if (!cur) {
      agg.set(key, {
        municipality: i.municipality!,
        district: i.district ?? null,
        active: isActive ? 1 : 0,
        total: 1,
        worstSeverity: (i.severity as never) ?? "low",
        lastUpdate: (i.lastUpdated as Date).toISOString(),
      });
    } else {
      cur.total += 1;
      if (isActive) cur.active += 1;
      if (rank[i.severity ?? "low"] < rank[cur.worstSeverity]) {
        cur.worstSeverity = (i.severity as never) ?? "low";
      }
      const iso = (i.lastUpdated as Date).toISOString();
      if (iso > cur.lastUpdate) cur.lastUpdate = iso;
    }
  }

  const list = Array.from(agg.values()).sort((a, b) => {
    if (a.active !== b.active) return b.active - a.active;
    return rank[a.worstSeverity] - rank[b.worstSeverity];
  });

  return NextResponse.json(
    {
      source: "lumes-internal",
      fetchedAt: new Date().toISOString(),
      count: list.length,
      municipalities: list,
    },
    {
      headers: {
        "Cache-Control": "public, s-maxage=120, stale-while-revalidate=300",
      },
    }
  );
}
