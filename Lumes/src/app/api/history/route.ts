// History API — returns persisted incidents from Prisma with date filtering
import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status") || undefined;
  const limit = parseInt(searchParams.get("limit") || "500");
  const offset = parseInt(searchParams.get("offset") || "0");
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
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: msg, count: 0, total: 0, incidents: [] },
      { status: 500 }
    );
  }
}
