// GET /api/risk?lat=X&lon=Y
//
// Composite fire-risk score: biomass × weather × topo.

import { NextRequest, NextResponse } from "next/server";
import { lookupCell } from "@/lib/biomass/synthetic-grid";
import { fetchOpenMeteoWeather, computeRisk } from "@/lib/risk/composite";
import { BIOMASS_PROFILES, type SpeciesGroup } from "@/lib/biomass/equations";
import { clientKey, rateLimit } from "@/lib/api/rate-limit";
import { logServerFailure } from "@/lib/observability";
import { createDataStateMeta } from "@/lib/data-state";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const lat = Number(url.searchParams.get("lat") ?? "");
  const lon = Number(url.searchParams.get("lon") ?? "");
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < 36.95 || lat > 42.15 || lon < -9.5 || lon > -6) {
    return NextResponse.json({ error: "lat and lon must be finite Portugal coordinates", dataState: createDataStateMeta("empty", "Invalid Portugal coordinates") }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
  const rl = rateLimit(clientKey(req), { limit: 30 });
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Rate limit exceeded", dataState: createDataStateMeta("retryable-error", "Rate limit exceeded") },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter), "Cache-Control": "no-store" } },
    );
  }

  const cell = lookupCell(
    // Synthetic grid is generated on demand — small enough we don't need it cached here.
    // Production: replace with proper data source.
    BIOMASS_LOOKUP_CACHE,
    lat,
    lon,
  );
  if (!cell) {
    return NextResponse.json({ error: "no biomass data", dataState: createDataStateMeta("empty", "No biomass data") }, { status: 404, headers: { "Cache-Control": "no-store" } });
  }
  const species = cell.dominantSpecies;
  const profile = BIOMASS_PROFILES[species];

  let weather;
  try {
    weather = await fetchOpenMeteoWeather(lat, lon);
  } catch (err) {
    logServerFailure("risk.fetch", err, { route: "/api/risk", retryable: true });
    return NextResponse.json(
      { error: "Weather data is temporarily unavailable.", dataState: createDataStateMeta("retryable-error", "Weather source unavailable") },
      { status: 502, headers: { "Cache-Control": "no-store" } }
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
      dataState: createDataStateMeta("healthy", undefined, new Date().toISOString(), "open-meteo"),
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
