// GET /api/biomass?lat=X&lon=Y
//
// Returns the biomass profile for the grid cell containing (lat, lon).
// Synthetic data until ICNF IFN5 is wired in.

import { NextRequest, NextResponse } from "next/server";
import { getSyntheticBiomassGrid, lookupCell } from "@/lib/biomass/synthetic-grid";
import { cached } from "@/lib/api/cache";
import { createDataStateMeta } from "@/lib/data-state";
import { logServerFailure } from "@/lib/observability";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PORTUGAL_BOUNDS = { south: 36.95, north: 42.15, west: -9.5, east: -6 };

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const lat = Number(url.searchParams.get("lat") ?? "");
  const lon = Number(url.searchParams.get("lon") ?? "");

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return NextResponse.json(
      { error: "lat and lon query params required, as decimal degrees", dataState: createDataStateMeta("empty", "Missing coordinates") },
      { status: 400, headers: { "Cache-Control": "no-store" } }
    );
  }
  if (lat < PORTUGAL_BOUNDS.south || lat > PORTUGAL_BOUNDS.north || lon < PORTUGAL_BOUNDS.west || lon > PORTUGAL_BOUNDS.east) {
    return NextResponse.json({ error: "lat/lon must be Portugal coordinates", dataState: createDataStateMeta("empty", "Coordinates outside Portugal") }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }

  try {
    const cells = await cached("biomass-cells", 24 * 60 * 60 * 1000, async () => getSyntheticBiomassGrid());
    const cell = lookupCell(cells, lat, lon);
    if (!cell) {
      return NextResponse.json({ error: "no biomass data at that point", dataState: createDataStateMeta("empty", "No biomass data at that point") }, { status: 404, headers: { "Cache-Control": "no-store" } });
    }

    return NextResponse.json(
      {
        lat: cell.lat,
        lon: cell.lon,
        cell: cell.id,
        species: {
          group: cell.dominantSpecies,
          label: cell.profile.pt,
          description: cell.profile.description,
        },
        biomass: {
          tonsPerHectare: cell.tonsPerHectare,
          emissionsTonCo2ePerHectare: cell.profile.emissionsPerHa,
          fuelModel: cell.profile.fuelModel,
          dominantFuel: cell.profile.dominantFuel,
          rateOfSpread: cell.profile.rateOfSpread,
        },
        source: "synthetic (ICNF IFN5 replacement pending)",
        refreshedAt: new Date().toISOString(),
        dataState: createDataStateMeta("healthy", undefined, new Date().toISOString(), "synthetic-biomass"),
      },
      {
        headers: {
          "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800",
        },
      },
    );
  } catch (err: unknown) {
    logServerFailure("biomass.fetch", err, { route: "/api/biomass", retryable: true });
    return NextResponse.json(
      { error: "Biomass data is temporarily unavailable.", dataState: createDataStateMeta("retryable-error", "Biomass source unavailable") },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
