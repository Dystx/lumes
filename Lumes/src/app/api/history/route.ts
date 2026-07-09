// History API — returns persisted incidents from Prisma with date filtering
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logServerFailure } from "@/lib/observability";
import { createDataStateMeta } from "@/lib/data-state";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status") || undefined;
  const rawLimit = Number(searchParams.get("limit") || "100");
  const rawOffset = Number(searchParams.get("offset") || "0");
  const limit = Number.isFinite(rawLimit) ? Math.min(100, Math.max(1, Math.trunc(rawLimit))) : 100;
  const offset = Number.isFinite(rawOffset) ? Math.min(100_000, Math.max(0, Math.trunc(rawOffset))) : 0;
  const startDate = searchParams.get("startDate");
  const endDate = searchParams.get("endDate");

  try {
    const where: any = {};
    if (status) where.status = status;
    if (startDate || endDate) {
      where.firstDetected = {};
      if (startDate) where.firstDetected.gte = new Date(startDate);
      if (endDate) where.firstDetected.lte = new Date(endDate);
    }

    const [incidents, total] = await Promise.all([
      db.incident.findMany({
        where,
        orderBy: { firstDetected: "desc" },
        take: limit,
        skip: offset,
      }),
      db.incident.count({ where }),
    ]);

    return NextResponse.json({
      count: incidents.length,
      total,
      incidents,
      fetchedAt: new Date().toISOString(),
      dataState: createDataStateMeta(incidents.length === 0 ? "empty" : "healthy", undefined, new Date().toISOString(), "incident-history"),
    });
  } catch (err: unknown) {
    logServerFailure("history.list", err, { route: "/api/history", retryable: true });
    return NextResponse.json(
      { error: "Incident history is temporarily unavailable.", count: 0, total: 0, incidents: [], dataState: createDataStateMeta("retryable-error", "History storage unavailable") },
      { status: 500 }
    );
  }
}
