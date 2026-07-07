// Community Reports API — Phase 2
// Users can submit smoke/flame/road-closure/evacuation reports
// Reports are stored in Prisma and can be moderated

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { reportSchema, validateBody } from "@/lib/api/schemas";
import { rateLimit, clientKey } from "@/lib/api/rate-limit";
import { assertSafeOrigin } from "@/lib/api/csrf";

// GET — list reports (optionally filtered by status)
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status") || undefined;
  const limit = parseInt(searchParams.get("limit") || "50");

  try {
    const where = status ? { status } : {};
    const reports = await db.communityReport.findMany({
      where,
      orderBy: { submittedAt: "desc" },
      take: limit,
    });

    return NextResponse.json({
      source: "community-reports",
      count: reports.length,
      reports,
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err), count: 0, reports: [] },
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
      { error: "Rate limit exceeded" },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } }
    );
  }

  try {
    // F-24 — zod validation
    const body = await request.json().catch(() => ({} as Record<string, unknown>));
    const v = validateBody(reportSchema, body);
    if (!v.ok) {
      return NextResponse.json({ error: v.error }, { status: 400 });
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
    }, { status: 201 });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}

// PATCH — moderate a report (verify/reject)
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, status, reviewedBy } = body;

    if (!id || !status) {
      return NextResponse.json(
        { error: "id and status are required" },
        { status: 400 }
      );
    }

    const report = await db.communityReport.update({
      where: { id },
      data: {
        status,
        reviewedAt: new Date(),
        reviewedBy: reviewedBy || "system",
      },
    });

    return NextResponse.json({ ok: true, report });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
