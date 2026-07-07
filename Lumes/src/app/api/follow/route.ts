// Follow API — persist followed incidents to Prisma
// F-22 (rate limit) + F-24 (zod validation) applied.

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { assertSafeOrigin } from "@/lib/api/csrf";
import { followSchema, validateBody } from "@/lib/api/schemas";
import { rateLimit, clientKey } from "@/lib/api/rate-limit";

// GET — list all followed incidents
export async function GET() {
  try {
    const followed = await db.followedIncident.findMany({
      orderBy: { followedAt: "desc" },
    });
    return NextResponse.json({
      count: followed.length,
      incidentIds: followed.map((f) => f.incidentId),
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err), count: 0, incidentIds: [] },
      { status: 500 }
    );
  }
}

// POST — follow an incident (rate limited: 30 req/min per IP)
export async function POST(request: NextRequest) {
  // CSRF: ensure browser same-origin requests only
  const csrfBlock = assertSafeOrigin(request);
  if (csrfBlock) return csrfBlock;

  const rl = rateLimit(clientKey(request), { limit: 30 });
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Rate limit exceeded" },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } }
    );
  }

  const body = await request.json().catch(() => null);
  const v = validateBody(followSchema, body);
  if (!v.ok) {
    return NextResponse.json({ error: v.error }, { status: 400 });
  }

  try {
    const followed = await db.followedIncident.upsert({
      where: { incidentId: v.data.incidentId },
      create: { incidentId: v.data.incidentId },
      update: { incidentId: v.data.incidentId },
    });

    return NextResponse.json({ ok: true, followed });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}

// DELETE — unfollow an incident
export async function DELETE(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const v = validateBody(followSchema, body);
  if (!v.ok) {
    return NextResponse.json({ error: v.error }, { status: 400 });
  }

  try {
    await db.followedIncident.delete({
      where: { incidentId: v.data.incidentId },
    }).catch(() => {}); // Ignore if not found

    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}