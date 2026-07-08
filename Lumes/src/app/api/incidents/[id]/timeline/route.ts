// Incident timeline — fetches persisted snapshots from Prisma
import { NextResponse } from "next/server";
import { getIncidentTimeline } from "@/lib/persistence";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const snapshots = await getIncidentTimeline(id);
    return NextResponse.json({
      incidentId: id,
      count: snapshots.length,
      snapshots,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: msg },
      { status: 500 }
    );
  }
}
