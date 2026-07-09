// GET /api/biomass?lat=X&lon=Y
//
// Returns the biomass profile for the grid cell containing (lat, lon).
// Synthetic data until ICNF IFN5 is wired in.

import { NextRequest, NextResponse } from "next/server";
import { getSyntheticBiomassGrid, lookupCell } from "@/lib/biomass/synthetic-grid";
import { cached } from "@/lib/api/cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const lat = parseFloat(url.searchParams.get("lat") ?? "");
  const lon = parseFloat(url.searchParams.get("lon") ?? "");

  if (Number.isNaN(lat) || Number.isNaN(lon)) {
    return NextResponse.json(
      { error: "lat and lon query params required, as decimal degrees" },
      { status: 400 }
    );
  }
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    return NextResponse.json({ error: "lat/lon out of range" }, { status: 400 });
  }

  const cells = await cached("biomass-cells", 24 * 60 * 60 * 1000, async () => getSyntheticBiomassGrid());
  const cell = lookupCell(cells, lat, lon);
  if (!cell) {
    return NextResponse.json({ error: "no biomass data at that point" }, { status: 404 });
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
    },
    {
      headers: {
        "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800",
      },
    }
  );
}
