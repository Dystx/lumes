// Health endpoint for uptime monitoring services.
//
// Returns 200 with a JSON snapshot of system health when everything
// is OK. Returns 503 when critical services are degraded so that
// UptimeRobot / BetterStack / Healthchecks.io can alert you.
//
// The check is intentionally simple: a /health response is for
// "can the box serve a response?" not "is every upstream alive?".
// Degraded-but-serving is still 200; full outage is 503.

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { cached } from "@/lib/api/cache";
import { createDataStateMeta } from "@/lib/data-state";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STALE_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes

export async function GET() {
  const start = Date.now();

  const data = await cached("health-check", 30_000, async () => {
    const checks: Record<string, "ok" | "fail" | "skip"> = {};
    let healthy = true;
    let lastUpdated: Date | null = null;

    // Database check
    try {
      const topRow = await db.incident.findFirst({
        // `lastUpdated` is the upstream incident event time and can stay old
        // for hours when an active fire has no state change. `lastSeen` is
        // refreshed by each successful ingest pass, which is the signal this
        // liveness endpoint actually needs.
        orderBy: { lastSeen: "desc" },
        select: { lastSeen: true },
      });
      lastUpdated = topRow?.lastSeen ?? null;
      checks.database = "ok";

      // Staleness: if no incident has been seen in 5 minutes, the
      // cron isn't running. We treat this as degraded but not full
      // outage (the read path still works for cached responses).
      if (
        !lastUpdated ||
        Date.now() - new Date(lastUpdated).getTime() > STALE_THRESHOLD_MS
      ) {
        checks.database = "fail";
        healthy = false;
      }
    } catch {
      checks.database = "fail";
      healthy = false;
    }

    return { checks, healthy, lastUpdated };
  });

  const { checks, healthy, lastUpdated } = data;

  // Build response
  const body = {
    status: healthy ? "ok" : "degraded",
    timestamp: new Date().toISOString(),
    uptime_s: Math.round(process.uptime()),
    latencyMs: Date.now() - start,
    checks,
    lastIncidentUpdate: lastUpdated?.toISOString() ?? null,
    version: process.env.npm_package_version ?? "1.0.0",
    dataState: createDataStateMeta(healthy ? "healthy" : "stale", healthy ? undefined : "Database freshness check failed"),
  };

  return NextResponse.json(body, {
    status: healthy ? 200 : 503,
    headers: {
      // Do NOT cache this — health must be live.
      "Cache-Control": "no-store",
    },
  });
}
