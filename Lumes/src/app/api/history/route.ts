// History API — returns persisted incidents from Prisma with date filtering
import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { logServerFailure } from "@/lib/observability";
import { createDataStateMeta } from "@/lib/data-state";
import { clientKey, rateLimit } from "@/lib/api/rate-limit";
import type { HistoryIncident, HistoryResponse } from "@/lib/types";

const VALID_STATUSES = new Set(["detected", "active", "contained", "monitoring", "resolved"]);

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status") || undefined;
  const rawLimit = Number(searchParams.get("limit") || "100");
  const rawOffset = Number(searchParams.get("offset") || "0");
  if (!Number.isInteger(rawLimit) || rawLimit < 1 || rawLimit > 100 || !Number.isInteger(rawOffset) || rawOffset < 0 || rawOffset > 100_000) {
    return NextResponse.json({ error: "limit must be 1–100 and offset must be 0–100000", dataState: createDataStateMeta("empty", "Invalid history bounds") }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
  if (status && (!VALID_STATUSES.has(status) || status.length > 20)) {
    return NextResponse.json({ error: "invalid incident status", dataState: createDataStateMeta("empty", "Invalid incident status") }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
  const limit = rawLimit;
  const offset = rawOffset;
  const startDate = searchParams.get("startDate");
  const endDate = searchParams.get("endDate");
  const start = startDate ? new Date(startDate) : null;
  const end = endDate ? new Date(endDate) : null;
  if ((startDate && Number.isNaN(start?.getTime())) || (endDate && Number.isNaN(end?.getTime()))) {
    return NextResponse.json({ error: "startDate and endDate must be valid ISO dates", dataState: createDataStateMeta("empty", "Invalid history dates") }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
  if (start && end && start > end) {
    return NextResponse.json({ error: "startDate must be before endDate", dataState: createDataStateMeta("empty", "Invalid history date range") }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }

  const rl = rateLimit(clientKey(request), { limit: 60 });
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Rate limit exceeded", dataState: createDataStateMeta("retryable-error", "Rate limit exceeded") },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter), "Cache-Control": "no-store" } },
    );
  }

  try {
    const where: Prisma.IncidentWhereInput = {};
    if (status) where.status = status;
    if (startDate || endDate) {
      where.firstDetected = {};
      if (start) where.firstDetected.gte = start;
      if (end) where.firstDetected.lte = end;
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

    const fetchedAt = new Date().toISOString();
    const serializedIncidents: HistoryIncident[] = incidents.map((incident) => ({
      id: incident.id,
      sourceId: incident.sourceId,
      sourceInternalId: incident.sourceInternalId,
      displayName: incident.displayName,
      eventType: incident.eventType,
      status: incident.status,
      severity: incident.severity,
      latitude: incident.latitude,
      longitude: incident.longitude,
      estimatedAreaHa: incident.estimatedAreaHa,
      municipality: incident.municipality,
      parish: incident.parish,
      district: incident.district,
      personnelTotal: incident.personnelTotal,
      assetsGround: incident.assetsGround,
      assetsAerial: incident.assetsAerial,
      confidence: incident.confidence,
      rasi: incident.rasi,
      naturezaText: incident.naturezaText,
      statusText: incident.statusText,
      firstSeen: incident.firstSeen.toISOString(),
      lastSeen: incident.lastSeen.toISOString(),
      firstDetected: incident.firstDetected.toISOString(),
      lastUpdated: incident.lastUpdated.toISOString(),
      createdAt: incident.createdAt.toISOString(),
      updatedAt: incident.updatedAt.toISOString(),
    }));
    const body: HistoryResponse = {
      count: serializedIncidents.length,
      total,
      incidents: serializedIncidents,
      fetchedAt,
      dataState: createDataStateMeta(serializedIncidents.length === 0 ? "empty" : "healthy", undefined, fetchedAt, "incident-history"),
    };

    return NextResponse.json(body, { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" } });
  } catch (err: unknown) {
    logServerFailure("history.list", err, { route: "/api/history", retryable: true });
    return NextResponse.json(
      { error: "Incident history is temporarily unavailable.", count: 0, total: 0, incidents: [], dataState: createDataStateMeta("retryable-error", "History storage unavailable") },
      { status: 502, headers: { "Cache-Control": "no-store" } }
    );
  }
}
