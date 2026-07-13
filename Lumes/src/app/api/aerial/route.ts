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
import { classifyDataState, createDataStateMeta } from "@/lib/data-state";
import { logServerFailure } from "@/lib/observability";
import type { MergeResult } from "@/lib/aerial/merge";

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
  if (!bbox) return NextResponse.json({ error: "bbox must be a finite Portugal-bounded rectangle", dataState: createDataStateMeta("empty", "Invalid bounding box") }, { status: 400, headers: { "Cache-Control": "no-store" } });
  const rl = rateLimit(clientKey(req), { limit: 30 });
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Rate limit exceeded", dataState: createDataStateMeta("retryable-error", "Rate limit exceeded") },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter), "Cache-Control": "no-store" } },
    );
  }
  const maxAltitudeFt = url.searchParams.get("maxAltitudeFt")
    ? Number(url.searchParams.get("maxAltitudeFt"))
    : undefined;
  const minAltitudeFt = url.searchParams.get("minAltitudeFt")
    ? Number(url.searchParams.get("minAltitudeFt"))
    : undefined;
  if ([maxAltitudeFt, minAltitudeFt].some((value) => value !== undefined && !Number.isFinite(value))) {
    return NextResponse.json({ error: "altitude bounds must be finite numbers", dataState: createDataStateMeta("empty", "Invalid altitude bounds") }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
  if ((maxAltitudeFt !== undefined && (maxAltitudeFt < -2_000 || maxAltitudeFt > 100_000))
    || (minAltitudeFt !== undefined && (minAltitudeFt < -2_000 || minAltitudeFt > 100_000))
    || (minAltitudeFt !== undefined && maxAltitudeFt !== undefined && minAltitudeFt > maxAltitudeFt)) {
    return NextResponse.json({ error: "altitude bounds are outside the supported range", dataState: createDataStateMeta("empty", "Altitude bounds outside supported range") }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }

  const bboxStr = bbox.join(",");
  const key = `aerial-${bboxStr}-${maxAltitudeFt ?? "none"}-${minAltitudeFt ?? "none"}`;
  try {
    const result = await cached<MergeResult>(key, 30_000, () =>
      mergeAircraft(bbox, { maxAltitudeFt, minAltitudeFt })
    );

    const dataState = createDataStateMeta(
      classifyDataState({ count: result.features.length }),
      result.errors.length > 0 ? "One or more aircraft sources were unavailable" : undefined,
      result.fetchedAt,
      "adsb-merge",
    );

    return NextResponse.json({ ...result, dataState }, {
      headers: {
        "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60",
      },
    });
  } catch (err: unknown) {
    logServerFailure("aerial.fetch", err, { route: "/api/aerial", retryable: true });
    const fetchedAt = new Date().toISOString();
    return NextResponse.json(
      {
        type: "FeatureCollection",
        fetchedAt,
        bbox,
        features: [],
        meta: { airplanes_live: 0, adsb_fi: 0, opensky: 0, merged: 0, sources_live: 0, sub_queries: 0 },
        errors: [],
        source: "adsb-merge",
        error: "Aerial data is temporarily unavailable.",
        dataState: createDataStateMeta("retryable-error", "Aerial source unavailable", fetchedAt, "adsb-merge"),
      },
      { status: 502, headers: { "Cache-Control": "no-store" } },
    );
  }
}
