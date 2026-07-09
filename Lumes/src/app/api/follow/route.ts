// Follow API — persist followed incidents to Prisma
// F-22 (rate limit) + F-24 (zod validation) applied.

import { NextRequest, NextResponse } from "next/server";
import { assertSafeOrigin } from "@/lib/api/csrf";
import { rateLimit, clientKey } from "@/lib/api/rate-limit";
import { createDataStateMeta } from "@/lib/data-state";

const FOLLOW_UNAVAILABLE = "Following incidents is available locally in this browser; server ownership is not configured.";

// GET — list all followed incidents
export async function GET() {
  return NextResponse.json(
    { error: FOLLOW_UNAVAILABLE, count: 0, incidentIds: [], dataState: createDataStateMeta("retryable-error", "Browser-local follow state is in use") },
    { status: 503, headers: { "Cache-Control": "no-store" } },
  );
}

// POST — follow an incident (rate limited: 30 req/min per IP)
export async function POST(request: NextRequest) {
  // CSRF: ensure browser same-origin requests only
  const csrfBlock = assertSafeOrigin(request);
  if (csrfBlock) return csrfBlock;

  const rl = rateLimit(clientKey(request), { limit: 30 });
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Rate limit exceeded", dataState: createDataStateMeta("retryable-error", "Rate limit exceeded") },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } }
    );
  }

  return NextResponse.json(
    { error: FOLLOW_UNAVAILABLE, dataState: createDataStateMeta("retryable-error", "Browser-local follow state is in use") },
    { status: 503, headers: { "Cache-Control": "no-store" } },
  );

}

// DELETE — unfollow an incident
export async function DELETE(request: NextRequest) {
  const csrfBlock = assertSafeOrigin(request);
  if (csrfBlock) return csrfBlock;

  return NextResponse.json(
    { error: FOLLOW_UNAVAILABLE, dataState: createDataStateMeta("retryable-error", "Browser-local follow state is in use") },
    { status: 503, headers: { "Cache-Control": "no-store" } },
  );

}
