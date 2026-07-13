// Incident timeline — fetches persisted snapshots from Prisma
import { NextResponse } from "next/server";
import { getIncidentTimeline } from "@/lib/persistence";
import { createDataStateMeta } from "@/lib/data-state";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const snapshots = await getIncidentTimeline(id);
    const latestSnapshot = snapshots.at(-1);
    const sourceUpdatedAt = latestSnapshot?.timestamp.toISOString();
    return NextResponse.json({
      incidentId: id,
      count: snapshots.length,
      snapshots,
      dataState: createDataStateMeta(snapshots.length === 0 ? "empty" : "healthy", undefined, sourceUpdatedAt, "incident-timeline"),
    }, { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" } });
  } catch {
    return NextResponse.json(
      { error: "Incident timeline is temporarily unavailable.", incidentId: id, count: 0, snapshots: [], dataState: createDataStateMeta("retryable-error", "Timeline storage unavailable", undefined, "incident-timeline") },
      { status: 502, headers: { "Cache-Control": "no-store" } },
    );
  }
}
