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
import { readRequestBodyWithinLimit } from "@/lib/api/request-body";

const MAX_REPORT_REQUEST_BYTES = 16 * 1024;

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
    // Keep the route boundary safe even if a persistence adapter returns
    // additional columns despite the select contract. Public callers only
    // receive the reviewed report DTO below.
    const publicReports = reports.map((report) => ({
      id: report.id,
      reportType: report.reportType,
      latitude: report.latitude,
      longitude: report.longitude,
      description: report.description,
      confidence: report.confidence,
      submittedAt: report.submittedAt,
      status: report.status,
    }));

    return NextResponse.json({
      source: "community-reports",
      count: publicReports.length,
      reports: publicReports,
      dataState: createDataStateMeta(publicReports.length === 0 ? "empty" : "healthy"),
    }, { headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=120" } });
  } catch (err: unknown) {
    logServerFailure("reports.list", err, { route: "/api/reports", retryable: true });
    return NextResponse.json(
      { error: "Reports are temporarily unavailable.", count: 0, reports: [], dataState: createDataStateMeta("retryable-error", "Reports storage unavailable") },
      { status: 500, headers: { "Cache-Control": "no-store" } }
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
      { status: 429, headers: { "Retry-After": String(rl.retryAfter), "Cache-Control": "no-store" } }
    );
  }

  try {
    // F-24 — zod validation
    const bodyResult = await readRequestBodyWithinLimit(request, MAX_REPORT_REQUEST_BYTES);
    if (!bodyResult.ok) {
      const tooLarge = bodyResult.reason === "too_large";
      return NextResponse.json(
        {
          error: tooLarge ? "Report payload too large" : "Invalid report payload",
          dataState: createDataStateMeta("empty", tooLarge ? "Report payload too large" : "Invalid report payload"),
        },
        { status: tooLarge ? 413 : 400, headers: { "Cache-Control": "no-store" } },
      );
    }

    let body: unknown = {};
    try {
      body = bodyResult.text ? JSON.parse(bodyResult.text) : {};
    } catch {
      body = {};
    }
    const v = validateBody(reportSchema, body);
    if (!v.ok) {
      return NextResponse.json({ error: v.error, dataState: createDataStateMeta("empty", "Invalid report") }, { status: 400, headers: { "Cache-Control": "no-store" } });
    }
    const data = v.data;

    // Public callers cannot self-assign trust. Staff identity can promote a
    // reviewed report later; submissions always enter as anonymous/pending.
    const reporterTier = "anonymous";
    const confidence = 0.3;

    const report = await db.communityReport.create({
      data: {
        reportType: data.type,
        latitude: data.lat!,
        longitude: data.lon!,
        description: data.description || null,
        reporterName: data.name || "anonymous",
        reporterTier,
        // Attachments are intentionally disabled until the provider, moderation,
        // retention, and privacy gates in docs/providers/community-attachments.md
        // are approved. Keep the legacy nullable field null in this JSON-only flow.
        photoUrl: null,
        confidence,
      },
    });

    return NextResponse.json({
      ok: true,
      // Keep the public acknowledgement deliberately narrow.  The stored
      // record contains reporter identity, coordinates, and free text that
      // must never be reflected to an unauthenticated caller.
      report: { id: report.id, status: "pending_review" },
      message: "Report submitted successfully. It will be reviewed by moderators.",
      dataState: createDataStateMeta("healthy"),
    }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (err: unknown) {
    logServerFailure("reports.submit", err, { route: "/api/reports", retryable: true });
    return NextResponse.json(
      { error: "Unable to submit the report right now.", dataState: createDataStateMeta("retryable-error", "Report storage unavailable") },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}

// PATCH — intentionally unavailable until staff moderation has attributable auth.
export async function PATCH(_request: NextRequest): Promise<NextResponse> {
  return NextResponse.json(
    { error: "Method not allowed", dataState: createDataStateMeta("empty", "Method not allowed") },
    { status: 405, headers: { Allow: "GET, POST", "Cache-Control": "no-store" } },
  );
}
