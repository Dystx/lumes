// GET /api/risk?lat=X&lon=Y
//
// Composite fire-risk score: biomass × weather × topo.

import { NextRequest, NextResponse } from "next/server";
import { lookupCell } from "@/lib/biomass/synthetic-grid";
import { fetchOpenMeteoWeather, computeRisk } from "@/lib/risk/composite";
import { BIOMASS_PROFILES, type SpeciesGroup } from "@/lib/biomass/equations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const lat = parseFloat(url.searchParams.get("lat") ?? "");
  const lon = parseFloat(url.searchParams.get("lon") ?? "");
  if (Number.isNaN(lat) || Number.isNaN(lon)) {
    return NextResponse.json({ error: "lat and lon required" }, { status: 400 });
  }

  const cell = lookupCell(
    // Synthetic grid is generated on demand — small enough we don't need it cached here.
    // Production: replace with proper data source.
    BIOMASS_LOOKUP_CACHE,
    lat,
    lon,
  );
  if (!cell) {
    return NextResponse.json({ error: "no biomass data" }, { status: 404 });
  }
  const species = cell.dominantSpecies;
  const profile = BIOMASS_PROFILES[species];

  let weather;
  try {
    weather = await fetchOpenMeteoWeather(lat, lon);
  } catch (err) {
    return NextResponse.json(
      { error: "weather unavailable", detail: err instanceof Error ? err.message : "unknown" },
      { status: 502 }
    );
  }

  const result = computeRisk({ biomass: profile, weather });

  return NextResponse.json(
    {
      lat,
      lon,
      biomass: {
        species,
        speciesLabel: profile.pt,
        tonsPerHectare: profile.tonsPerHectare,
      },
      risk: result,
    },
    {
      headers: {
        // Re-evaluate every 5 min — risk is volatile.
        "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
      },
    }
  );
}

// Lazy-imported to avoid circular types at top of file.
import { getSyntheticBiomassGrid } from "@/lib/biomass/synthetic-grid";
const BIOMASS_LOOKUP_CACHE = getSyntheticBiomassGrid();

// Reference import for SpeciesGroup type usage.
const _x: SpeciesGroup = "maritime_pine";
void _x;
