// Cron-triggereable ingest endpoint.
//
// Auth: pass `Authorization: Bearer $CRON_SECRET` (or `?secret=...` for
// easy testing with cron-job.org / curl). The endpoint is fail-closed:
// if `CRON_SECRET` is not configured, every request is rejected.
//
// Usage:
//
//   # External cron service (Vercel Cron, cron-job.org, GitHub Actions, etc.):
//   curl -H "Authorization: Bearer $CRON_SECRET" \
//        https://lumes.pt/api/cron/ingest
//
//   # Manual trigger:
//   curl "https://lumes.pt/api/cron/ingest?secret=$CRON_SECRET"
//
// Schedule: every 60 seconds. The endpoint is idempotent and safe to
// call more frequently if needed; Prisma upserts dedupe writes.

import { NextRequest, NextResponse } from "next/server";
import { runIngest } from "@/lib/ingest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorize(req: NextRequest): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    // Fail-closed: no secret configured means no calls permitted.
    return false;
  }
  // Prefer header (Authorization: Bearer ...) so secrets don't end up in proxy logs.
  const header = req.headers.get("authorization") ?? "";
  if (header === `Bearer ${expected}`) return true;
  // x-cron-secret header is also accepted (cleaner than Authorization)
  const xHeader = req.headers.get("x-cron-secret") ?? "";
  if (xHeader && xHeader === expected) return true;
  // Legacy: query-param secret is still accepted but logged as warning
  const q = req.nextUrl.searchParams.get("secret");
  if (q && q === expected) {
    console.warn(`[cron/ingest] secret passed as URL query parameter — migrate to 'x-cron-secret' header to avoid proxy logs`);
    return true;
  }
  return false;
}

async function handle(req: NextRequest) {
  if (!authorize(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const result = await runIngest();
    return NextResponse.json(result);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  return handle(req);
}

export async function POST(req: NextRequest) {
  return handle(req);
}
