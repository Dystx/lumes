// GET /api/aerial?bbox=W,S,E,N&maxAltitudeFt=…
//
// Multi-source ADS-B feed merge for the lumes.pt aerial response layer.
// Default bbox is mainland Portugal; operator can scope per-incident.
//
// Cached server-side for 30 s. Falls back gracefully per-source if any
// upstream is unreachable.

import { NextRequest, NextResponse } from "next/server";
import { mergeAircraft } from "@/lib/aerial/merge";
import { cached } from "@/lib/api/cache";
import { clientKey, rateLimit } from "@/lib/api/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PORTUGAL_BBOX: [number, number, number, number] = [-9.5, 36.95, -6.0, 42.15];

export function parseBbox(s: string | null): [number, number, number, number] | null {
  if (!s) return null;
  const parts = s.split(",").map(Number);
  if (parts.length !== 4 || parts.some((value) => !Number.isFinite(value))) return null;
  const [west, south, east, north] = parts;
  if (west < PORTUGAL_BBOX[0] || south < PORTUGAL_BBOX[1] || east > PORTUGAL_BBOX[2] || north > PORTUGAL_BBOX[3]) return null;
  if (west >= east || south >= north) return null;
  return [west, south, east, north];
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const bboxParam = url.searchParams.get("bbox");
  const bbox = parseBbox(bboxParam) ?? (bboxParam === null ? PORTUGAL_BBOX : null);
  if (!bbox) return NextResponse.json({ error: "bbox must be a finite Portugal-bounded rectangle" }, { status: 400 });
  const rl = rateLimit(clientKey(req), { limit: 30 });
  if (!rl.ok) {
    return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429, headers: { "Retry-After": String(rl.retryAfter) } });
  }
  const maxAltitudeFt = url.searchParams.get("maxAltitudeFt")
    ? Number(url.searchParams.get("maxAltitudeFt"))
    : undefined;
  const minAltitudeFt = url.searchParams.get("minAltitudeFt")
    ? Number(url.searchParams.get("minAltitudeFt"))
    : undefined;
  if ([maxAltitudeFt, minAltitudeFt].some((value) => value !== undefined && !Number.isFinite(value))) {
    return NextResponse.json({ error: "altitude bounds must be finite numbers" }, { status: 400 });
  }

  const bboxStr = bbox.join(",");
  const key = `aerial-${bboxStr}-${maxAltitudeFt ?? "none"}-${minAltitudeFt ?? "none"}`;
  const result = await cached(key, 30_000, () =>
    mergeAircraft(bbox, { maxAltitudeFt, minAltitudeFt })
  );

  return NextResponse.json(result, {
    headers: {
      "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60",
    },
  });
}
