// Persistence stats — shows database health + incident counts
import { NextResponse } from "next/server";
import { getPersistenceStats } from "@/lib/persistence";

export async function GET() {
  try {
    const stats = await getPersistenceStats();
    return NextResponse.json({
      ...stats,
      fetchedAt: new Date().toISOString(),
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: msg, total: 0, active: 0, resolved: 0, snapshots: 0 },
      { status: 500 }
    );
  }
}
