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
import { cached } from "@/lib/api/cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteParams {
  params: Promise<{ name: string }>;
}

function decode(name: string): string {
  try {
    return decodeURIComponent(name);
  } catch {
    return name;
  }
}

export async function GET(req: NextRequest, { params }: RouteParams) {
  const { name } = await params;
  const regionName = decode(name).trim();
  if (!regionName) {
    return NextResponse.json({ error: "missing region name" }, { status: 400 });
  }

  // Cache by lowercase + status filter
  const url = new URL(req.url);
  const includeResolved = url.searchParams.get("resolved") === "1";
  const cacheKey = `${regionName.toLowerCase()}|${includeResolved}`;

  const statusFilter = includeResolved
    ? undefined
    : { in: ["detected", "active", "contained", "monitoring"] };

  try {
    const data = await cached(`region-${cacheKey}`, 30_000, async () => {
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

      return {
        region: regionName,
        source: "lumes-internal",
        fetchedAt: new Date().toISOString(),
        count: incidents.length,
        incidents,
        includeResolved,
      };
    });

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
