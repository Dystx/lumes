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
import { logServerFailure } from "@/lib/observability";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STALE_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes

export async function GET() {
  const start = Date.now();

  let data: { checks: Record<string, "ok" | "fail" | "skip">; healthy: boolean; lastUpdated: Date | null };
  try {
    data = await cached("health-check", 30_000, async () => {
    const checks: Record<string, "ok" | "fail" | "skip"> = {};
    let healthy = true;
    let lastUpdated: Date | null = null;

    // Database check
    try {
      const [topRow, incidentCount] = await Promise.all([
        db.incident.findFirst({
          // `lastUpdated` is the upstream incident event time and can stay old
          // for hours when an active fire has no state change. `lastSeen` is
          // refreshed by each successful ingest pass, which is the signal this
          // liveness endpoint actually needs.
          orderBy: { lastSeen: "desc" },
          select: { lastSeen: true },
        }),
        db.incident.count(),
      ]);
      lastUpdated = topRow?.lastSeen ?? null;
      checks.database = "ok";

      // An empty database is a valid clean-runner state: the database is
      // reachable, but there is no ingestion history to mark stale yet.
      // Staleness only applies after at least one incident has been stored.
      const stale = incidentCount > 0 && (
        !lastUpdated || Date.now() - lastUpdated.getTime() > STALE_THRESHOLD_MS
      );
      if (stale) {
        checks.database = "fail";
        healthy = false;
      }
    } catch {
      checks.database = "fail";
      healthy = false;
    }

      return { checks, healthy, lastUpdated };
    });
  } catch (err: unknown) {
    logServerFailure("health.fetch", err, { route: "/api/health", retryable: true });
    return NextResponse.json(
      {
        status: "degraded",
        timestamp: new Date().toISOString(),
        uptime_s: Math.round(process.uptime()),
        latencyMs: Date.now() - start,
        checks: { cache: "fail" },
        lastIncidentUpdate: null,
        version: process.env.npm_package_version ?? "1.0.0",
        dataState: createDataStateMeta("stale", "Health cache unavailable"),
      },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

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
