// GET /api/aerial?bbox=W,S,E,N&maxAltitudeFt=…
//
// Multi-source ADS-B feed merge for the lumes.pt aerial response layer.
// Default bbox is mainland Portugal; operator can scope per-incident.
//
// Cached server-side for 30 s. Falls back gracefully per-source if any
// upstream is unreachable.

import { NextRequest, NextResponse } from "next/server";
import { mergeAircraft } from "@/lib/aerial/merge";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PORTUGAL_BBOX: [number, number, number, number] = [-9.5, 36.95, -6.0, 42.15];

function parseBbox(s: string | null): [number, number, number, number] | null {
  if (!s) return null;
  const parts = s.split(",").map(Number);
  if (parts.length !== 4 || parts.some(Number.isNaN)) return null;
  return parts as [number, number, number, number];
}

let cache: { ts: number; bbox: string; result: Awaited<ReturnType<typeof mergeAircraft>> } | null = null;
const CACHE_TTL_MS = 30_000;

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const bbox = parseBbox(url.searchParams.get("bbox")) ?? PORTUGAL_BBOX;
  const maxAltitudeFt = url.searchParams.get("maxAltitudeFt")
    ? Number(url.searchParams.get("maxAltitudeFt"))
    : undefined;
  const minAltitudeFt = url.searchParams.get("minAltitudeFt")
    ? Number(url.searchParams.get("minAltitudeFt"))
    : undefined;

  const bboxStr = bbox.join(",");
  if (
    cache && cache.bbox === bboxStr && Date.now() - cache.ts < CACHE_TTL_MS &&
    maxAltitudeFt === undefined && minAltitudeFt === undefined
  ) {
    return NextResponse.json(cache.result, {
      headers: {
        "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60",
      },
    });
  }

  const result = await mergeAircraft(bbox, { maxAltitudeFt, minAltitudeFt });
  if (maxAltitudeFt === undefined && minAltitudeFt === undefined) {
    cache = { ts: Date.now(), bbox: bboxStr, result };
  }

  return NextResponse.json(result, {
    headers: {
      "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60",
    },
  });
}
