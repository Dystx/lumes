// GET /api/risk-fwi/today|tomorrow|after
//
// Today / tomorrow / day-after fire risk by municipality (RCM) from IPMA.
//
// We cache per-day on the server and surface via a stable, documentable
// API that we control — our equivalent of fogos.pt's `risk-today` / etc.
// without depending on their API.

import { NextRequest, NextResponse } from "next/server";
import { cached } from "@/lib/api/cache";
import { createDataStateMeta } from "@/lib/data-state";
import { logServerFailure } from "@/lib/observability";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DAY_INDEX = { today: 0, tomorrow: 1, after: 2 } as const;
type Day = keyof typeof DAY_INDEX;
const DAY_VALID = (d: string): d is Day => d in DAY_INDEX;

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
  const url = `https://api.ipma.pt/open-data/forecast/meteorology/rcm/rcm-d${idx}.json`;
  try {
    const data = await cached(`risk-fwi-d${idx}`, 6 * 60 * 60 * 1000, async () => {
      const r = await fetch(url, { signal: AbortSignal.timeout(10_000) });
      if (!r.ok) {
        throw new Error(`IPMA HTTP ${r.status}`);
      }
      return await r.json();
    });

    return NextResponse.json(
      { when: day, ...(data as Record<string, unknown>), dataState: createDataStateMeta("healthy", undefined, new Date().toISOString(), "ipma") },
      {
        headers: {
          "Cache-Control": "public, s-maxage=21600, stale-while-revalidate=86400",
        },
      }
    );
  } catch (err: unknown) {
    logServerFailure("risk-fwi.fetch", err, { route: "/api/risk-fwi", retryable: true });
    return NextResponse.json(
      { error: "Fire-risk data is temporarily unavailable.", dataState: createDataStateMeta("retryable-error", "IPMA unavailable") },
      { status: 502 }
    );
  }
}
