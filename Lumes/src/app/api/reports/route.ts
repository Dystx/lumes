// Community Reports API — Phase 2
// Users can submit smoke/flame/road-closure/evacuation reports
// Reports are stored in Prisma. Public callers can submit and read reports;
// moderation requires a future staff identity system and is not exposed here.

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { reportSchema, validateBody } from "@/lib/api/schemas";
import { rateLimit, clientKey } from "@/lib/api/rate-limit";
import { assertSafeOrigin } from "@/lib/api/csrf";
import { logServerFailure } from "@/lib/observability";
import { createDataStateMeta } from "@/lib/data-state";

// GET — list reports (optionally filtered by status)
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  // Only reviewed reports are public.  Never expose reporter identity,
  // moderation notes, or unbounded rows to an unauthenticated caller.
  const status = "verified";
  const parsedLimit = Number(searchParams.get("limit") || "50");
  const limit = Number.isFinite(parsedLimit) ? Math.min(100, Math.max(1, Math.trunc(parsedLimit))) : 50;

  try {
    const where = { status };
    const reports = await db.communityReport.findMany({
      where,
      orderBy: { submittedAt: "desc" },
      take: limit,
      select: {
        id: true,
        reportType: true,
        latitude: true,
        longitude: true,
        description: true,
        confidence: true,
        submittedAt: true,
        status: true,
      },
    });

    return NextResponse.json({
      source: "community-reports",
      count: reports.length,
      reports,
      dataState: createDataStateMeta(reports.length === 0 ? "empty" : "healthy"),
    });
  } catch (err: unknown) {
    logServerFailure("reports.list", err, { route: "/api/reports", retryable: true });
    return NextResponse.json(
      { error: "Reports are temporarily unavailable.", count: 0, reports: [], dataState: createDataStateMeta("retryable-error", "Reports storage unavailable") },
      { status: 500 }
    );
  }
}

// POST — submit a new community report
export async function POST(request: NextRequest) {
  // S-01 CSRF protection
  const csrfBlock = assertSafeOrigin(request);
  if (csrfBlock) return csrfBlock;

  // F-22 — rate limit (10 reports/min per IP)
  const rl = rateLimit(clientKey(request), { limit: 10 });
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Rate limit exceeded", dataState: createDataStateMeta("retryable-error", "Rate limit exceeded") },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } }
    );
  }

  try {
    // F-24 — zod validation
    const body = await request.json().catch(() => ({} as Record<string, unknown>));
    const v = validateBody(reportSchema, body);
    if (!v.ok) {
      return NextResponse.json({ error: v.error, dataState: createDataStateMeta("empty", "Invalid report") }, { status: 400, headers: { "Cache-Control": "no-store" } });
    }
    const data = v.data;

    const reporterTier = (data as any).reporterTier || "anonymous";
    const confidence =
      reporterTier === "official" ? 1.0
      : reporterTier === "professional" ? 0.9
      : reporterTier === "verified_local" ? 0.7
      : reporterTier === "registered" ? 0.5
      : 0.3;

    const report = await db.communityReport.create({
      data: {
        reportType: data.type,
        latitude: data.lat!,
        longitude: data.lon!,
        description: data.description || null,
        reporterName: data.name || "anonymous",
        reporterTier,
        photoUrl: null, // photos uploaded separately (TODO)
        confidence,
      },
    });

    return NextResponse.json({
      ok: true,
      report,
      message: "Report submitted successfully. It will be reviewed by moderators.",
      dataState: createDataStateMeta("healthy"),
    }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (err: unknown) {
    logServerFailure("reports.submit", err, { route: "/api/reports", retryable: true });
    return NextResponse.json(
      { error: "Unable to submit the report right now.", dataState: createDataStateMeta("retryable-error", "Report storage unavailable") },
      { status: 500 }
    );
  }
}

// PATCH — intentionally unavailable until staff moderation has attributable auth.
export async function PATCH(_request: NextRequest): Promise<NextResponse> {
  return NextResponse.json(
    { error: "Method not allowed" },
    { status: 405, headers: { Allow: "GET, POST", "Cache-Control": "no-store" } },
  );
}
