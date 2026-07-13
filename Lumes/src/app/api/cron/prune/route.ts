// GET /api/cron/prune — garbage-collect old incidents and snapshots
//
// TASK G (refactor plan): the persistence layer accumulates records
// indefinitely. Even after my earlier "live preferred" fix, the DB still
// had 2,500+ records. This endpoint runs daily to:
//   1. Mark incidents not seen in 7 days as 'resolved' (status compaction)
//   2. Delete snapshots older than 30 days
//   3. Delete incidents last seen 30+ days ago (final cleanup)
//
// Security: requires a `?secret=...` query param matching CRON_SECRET
// (same auth as /api/cron/ingest).

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logServerFailure } from "@/lib/observability";

const PRUNE_AFTER_DAYS = 30; // delete incidents last seen 30+ days ago
const COMPACT_AFTER_DAYS = 7; // mark as 'resolved' after 7 days inactive
const SNAPSHOT_AFTER_DAYS = 30; // delete snapshots older than 30 days

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isAuthorized(req: NextRequest): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;
  // Prefer headers (Authorization or x-cron-secret) over query params
  const header = req.headers.get("authorization") ?? "";
  if (header === `Bearer ${expected}`) return true;
  const xHeader = req.headers.get("x-cron-secret") ?? "";
  if (xHeader && xHeader === expected) return true;
  // Legacy query-param support (logged as warning)
  const secret = req.nextUrl.searchParams.get("secret");
  if (secret && secret === expected) {
    console.warn(`[cron/prune] secret passed as URL query parameter — migrate to 'x-cron-secret' header`);
    return true;
  }
  return false;
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }

  const now = Date.now();
  const compactCutoff = new Date(now - COMPACT_AFTER_DAYS * 24 * 60 * 60 * 1000);
  const snapshotCutoff = new Date(now - SNAPSHOT_AFTER_DAYS * 24 * 60 * 60 * 1000);
  const deleteCutoff = new Date(now - PRUNE_AFTER_DAYS * 24 * 60 * 60 * 1000);

  try {
    // 1. Compact: mark stale non-resolved incidents as resolved
    const compactResult = await db.incident.updateMany({
      where: {
        lastSeen: { lt: compactCutoff },
        status: { not: "resolved" },
      },
      data: { status: "resolved" },
    });

    // 2. Snapshot cleanup
    const snapshotResult = await db.incidentSnapshot.deleteMany({
      where: { timestamp: { lt: snapshotCutoff } },
    });

    // 3. Final cleanup: delete incidents last seen 30+ days ago
    const incidentResult = await db.incident.deleteMany({
      where: { lastSeen: { lt: deleteCutoff } },
    });

    return NextResponse.json({
        ok: true,
        prunedAt: new Date().toISOString(),
        compact: {
          cutoff: compactCutoff.toISOString(),
          marked: compactResult.count,
        },
        snapshots: {
          cutoff: snapshotCutoff.toISOString(),
          deleted: snapshotResult.count,
        },
        incidents: {
          cutoff: deleteCutoff.toISOString(),
          deleted: incidentResult.count,
        },
      }, {
        headers: { "Cache-Control": "no-store" },
      },
    );
  } catch (err: unknown) {
    logServerFailure("cron.prune", err, { route: "/api/cron/prune", retryable: true });
    return NextResponse.json(
      { error: "Prune is temporarily unavailable." },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
