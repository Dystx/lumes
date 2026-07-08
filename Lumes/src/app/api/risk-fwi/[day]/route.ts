// GET /api/risk-fwi/today|tomorrow|after
//
// Today / tomorrow / day-after fire risk by municipality (RCM) from IPMA.
//
// We cache per-day on the server and surface via a stable, documentable
// API that we control — our equivalent of fogos.pt's `risk-today` / etc.
// without depending on their API.

import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DAY_INDEX = { today: 0, tomorrow: 1, after: 2 } as const;
type Day = keyof typeof DAY_INDEX;
const DAY_VALID = (d: string): d is Day => d in DAY_INDEX;

const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 h
const cache = new Map<string, { ts: number; data: unknown }>();

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ day: string }> },
) {
  const { day: rawDay } = await ctx.params;
  const day = (rawDay ?? "").toLowerCase();
  if (!DAY_VALID(day)) {
    return NextResponse.json(
      { error: "day must be one of: today, tomorrow, after" },
      { status: 400 }
    );
  }

  const idx = DAY_INDEX[day];
  const cacheKey = `rcm-d${idx}`;
  const hit = cache.get(cacheKey);
  if (hit && Date.now() - hit.ts < CACHE_TTL_MS) {
    return NextResponse.json(hit.data, {
      headers: {
        "Cache-Control": "public, s-maxage=21600, stale-while-revalidate=86400",
      },
    });
  }

  const url = `https://api.ipma.pt/open-data/forecast/meteorology/rcm/rcm-d${idx}.json`;
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!r.ok) {
      return NextResponse.json(
        { error: `IPMA HTTP ${r.status}` },
        { status: 502 }
      );
    }
    const data = await r.json();

    cache.set(cacheKey, { ts: Date.now(), data });

    return NextResponse.json(
      { when: day, ...(data as Record<string, unknown>) },
      {
        headers: {
          "Cache-Control": "public, s-maxage=21600, stale-while-revalidate=86400",
        },
      }
    );
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "ipma fetch failed" },
      { status: 502 }
    );
  }
}
