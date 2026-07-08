// Region-scoped incident lookup. Powers SEO landing pages and
// per-municipality dashboards.
//
// URL: GET /api/region/[name]
//
//   - [name] is matched case-insensitively against Incident.municipality
//     and Incident.district (so `Lisboa` returns fires in the Lisbon
//     municipality; `Coimbra` returns fires in any municipality in the
//     Coimbra district).
//
// Response shape mirrors /api/incidents but is filtered.

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteParams {
  params: { name: string };
}

const CACHE_TTL_MS = 30_000;
const cache = new Map<string, { ts: number; data: unknown }>();

function decode(name: string): string {
  try {
    return decodeURIComponent(name);
  } catch {
    return name;
  }
}

export async function GET(req: NextRequest, { params }: RouteParams) {
  const regionName = decode(params.name).trim();
  if (!regionName) {
    return NextResponse.json({ error: "missing region name" }, { status: 400 });
  }

  // Cache by lowercase + status filter
  const url = new URL(req.url);
  const includeResolved = url.searchParams.get("resolved") === "1";
  const cacheKey = `${regionName.toLowerCase()}|${includeResolved}`;
  const hit = cache.get(cacheKey);
  if (hit && Date.now() - hit.ts < CACHE_TTL_MS) {
    return NextResponse.json(hit.data, {
      headers: {
        "Cache-Control": "public, s-maxage=30, stale-while-revalidate=120",
      },
    });
  }

  const statusFilter = includeResolved
    ? undefined
    : { in: ["detected", "active", "contained", "monitoring"] as const };

  try {
    const incidents = await db.incident.findMany({
      where: {
        OR: [
          { municipality: { contains: regionName } },
          { district: { contains: regionName } },
        ],
        ...(statusFilter ? { status: statusFilter } : {}),
      },
      orderBy: { lastUpdated: "desc" },
      take: 200,
    });

    const data = {
      region: regionName,
      source: "lumes-internal",
      fetchedAt: new Date().toISOString(),
      count: incidents.length,
      incidents,
      includeResolved,
    };

    cache.set(cacheKey, { ts: Date.now(), data });
    return NextResponse.json(data, {
      headers: {
        "Cache-Control": "public, s-maxage=30, stale-while-revalidate=120",
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: msg, region: regionName },
      { status: 500 }
    );
  }
}
