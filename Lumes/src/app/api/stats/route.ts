// Persistence stats — shows database health + incident counts
import { NextResponse } from "next/server";
import { getPersistenceStats } from "@/lib/persistence";
import { cached } from "@/lib/api/cache";
import { classifyDataState, createDataStateMeta } from "@/lib/data-state";
import { logServerFailure } from "@/lib/observability";
import type { PersistenceStatsResponse } from "@/lib/types";

export async function GET() {
  try {
    const stats = await cached("persistence-stats", 60_000, getPersistenceStats);
    const fetchedAt = new Date().toISOString();
    const response: PersistenceStatsResponse = {
      ...stats,
      fetchedAt,
      dataState: createDataStateMeta(
        classifyDataState({ count: stats.total }),
        undefined,
        fetchedAt,
        "persistence",
      ),
    };
    return NextResponse.json(response, {
      headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=120" },
    });
  } catch (err: unknown) {
    logServerFailure("stats.fetch", err, { route: "/api/stats", retryable: true });
    return NextResponse.json(
      {
        error: "Persistence statistics are temporarily unavailable.",
        total: 0,
        active: 0,
        resolved: 0,
        snapshots: 0,
        dataState: createDataStateMeta(
          "retryable-error",
          "Persistence statistics could not be loaded",
          undefined,
          "persistence",
        ),
      },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
