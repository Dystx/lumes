// POST /api/incidents/risks
//
// Body: { incidentIds: ["anepc-1", "anepc-2", …] } (max 200 per call)
//
// Returns the composite biomass × weather risk score for each incident.
// This powers the "site-specific risk" feature on the map — every fire
// marker gets the risk score for *its actual location*, not just the
// static ANEPC severity. This is what differentiates lumes.pt: fogos.pt
// shows static severity, lumes.pt shows live fire-weather behaviour at
// each location.

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSyntheticBiomassGrid, lookupCell } from "@/lib/biomass/synthetic-grid";
import { BIOMASS_PROFILES, type SpeciesGroup } from "@/lib/biomass/equations";
import { fetchOpenMeteoWeather, computeRisk, type WeatherSnapshot } from "@/lib/risk/composite";
import { cached } from "@/lib/api/cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_IDS = 200;

interface RiskResponse {
  score: number;
  category: "low" | "moderate" | "high" | "very_high" | "extreme";
  ignition: number;
  intensity: number;
  biomassProfile: string;
  dataQuality: "ok" | "no_biomass" | "no_weather";
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({} as Record<string, unknown>)) as Record<string, unknown>;
  const idsRaw = Array.isArray(body.incidentIds) ? body.incidentIds : [];
  const ids: string[] = Array.from(
    new Set(
      idsRaw
        .filter((x): x is string => typeof x === "string")
        .slice(0, MAX_IDS),
    ),
  );
  if (ids.length === 0) {
    return NextResponse.json({ risks: {}, fetchedAt: new Date().toISOString() });
  }

  const incidents = await db.incident.findMany({
    where: { id: { in: ids } },
    select: { id: true, latitude: true, longitude: true },
  });

  const cells = getSyntheticBiomassGrid();

  // Compute risk in parallel. Many fetches → small cache layer per coord.
  const weatherCache = new Map<string, WeatherSnapshot | null>();
  async function getWeather(lat: number, lon: number) {
    const key = `${lat.toFixed(2)}_${lon.toFixed(2)}`;
    if (weatherCache.has(key)) return weatherCache.get(key);
    const w = await fetchOpenMeteoWeather(lat, lon).catch(() => null);
    weatherCache.set(key, w);
    return w;
  }

  const outcomes = await Promise.all(
    incidents.map(async (inc): Promise<[string, RiskResponse | null]> => {
      const risk = await cached<RiskResponse>(`inc-risk-${inc.id}`, 5 * 60 * 1000, async () => {
        const cell = lookupCell(cells, inc.latitude, inc.longitude);
        if (!cell) {
          return {
            score: 0, category: "low",
            ignition: 0, intensity: 0,
            biomassProfile: "no_data",
            dataQuality: "no_biomass" as const,
          };
        }
        const profile = BIOMASS_PROFILES[cell.dominantSpecies];
        const weather = await getWeather(inc.latitude, inc.longitude);
        if (!weather) {
          return {
            score: 0, category: "low",
            ignition: 0, intensity: 0,
            biomassProfile: cell.dominantSpecies,
            dataQuality: "no_weather" as const,
          };
        }
        const r = computeRisk({ biomass: profile, weather });
        return {
          score: r.score,
          category: r.category,
          ignition: r.ignitionLikelihood,
          intensity: r.intensityPotential,
          biomassProfile: cell.dominantSpecies,
          dataQuality: "ok" as const,
        };
      });
      return [inc.id, risk];
    }),
  );

  const risks = Object.fromEntries(
    outcomes.filter(([, r]) => r !== null),
  ) as Record<string, RiskResponse>;

  return NextResponse.json(
    { risks, fetchedAt: new Date().toISOString() },
    {
      headers: {
        "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
      },
    }
  );
}
