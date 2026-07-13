// POST /api/incidents/risks
//
// Body: { incidentIds: ["anepc-1", "anepc-2", …] } (max 50 per call)
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
import { BIOMASS_PROFILES } from "@/lib/biomass/equations";
import { fetchOpenMeteoWeather, computeRisk, type WeatherSnapshot } from "@/lib/risk/composite";
import { cached } from "@/lib/api/cache";
import { clientKey, rateLimit } from "@/lib/api/rate-limit";
import { logServerFailure } from "@/lib/observability";
import { createDataStateMeta } from "@/lib/data-state";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_IDS = 50;
const MAX_CONCURRENCY = 6;

function isPortugalCoordinate(latitude: number, longitude: number): boolean {
  return Number.isFinite(latitude) && Number.isFinite(longitude)
    && latitude >= 36.95 && latitude <= 42.15
    && longitude >= -9.5 && longitude <= -6;
}

async function mapWithConcurrency<T, R>(items: T[], limit: number, worker: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const run = async () => {
    while (true) {
      const index = next++;
      if (index >= items.length) return;
      results[index] = await worker(items[index]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => run()));
  return results;
}

interface RiskResponse {
  score: number;
  category: "low" | "moderate" | "high" | "very_high" | "extreme";
  ignition: number;
  intensity: number;
  biomassProfile: string;
  dataQuality: "ok" | "no_biomass" | "no_weather";
}

export async function POST(req: NextRequest) {
  const rl = rateLimit(clientKey(req), { limit: 20 });
  if (!rl.ok) {
    return NextResponse.json({ error: "Rate limit exceeded", dataState: createDataStateMeta("retryable-error", "Rate limit exceeded") }, {
      status: 429,
      headers: { "Retry-After": String(rl.retryAfter), "Cache-Control": "no-store" },
    });
  }

  const body = await req.json().catch(() => null) as unknown;
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Request body must be an object", dataState: createDataStateMeta("empty", "Invalid request body") }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
  const raw = (body as Record<string, unknown>).incidentIds;
  if (!Array.isArray(raw) || raw.some((value) => typeof value !== "string" || value.trim().length === 0 || value.length > 120)) {
    return NextResponse.json({ error: `incidentIds must contain at most ${MAX_IDS} non-empty strings`, dataState: createDataStateMeta("empty", "Invalid incident IDs") }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
  if (raw.length > MAX_IDS) {
    return NextResponse.json({ error: `incidentIds must contain at most ${MAX_IDS} items`, dataState: createDataStateMeta("empty", "Too many incident IDs") }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
  const ids: string[] = Array.from(new Set(raw.map((value) => value.trim())));
  if (ids.length === 0) {
    return NextResponse.json({ risks: {}, fetchedAt: new Date().toISOString(), dataState: createDataStateMeta("empty", "No incident IDs supplied") }, { headers: { "Cache-Control": "no-store" } });
  }

  try {
    const incidents = await db.incident.findMany({
      where: { id: { in: ids } },
      select: { id: true, latitude: true, longitude: true },
    });

    const cells = getSyntheticBiomassGrid();

    // Compute risk with bounded concurrency. Many fetches share a small
    // per-coordinate cache so one request cannot fan out without a budget.
    const weatherCache = new Map<string, Promise<WeatherSnapshot | null>>();
    function getWeather(lat: number, lon: number): Promise<WeatherSnapshot | null> {
      const key = `${lat.toFixed(2)}_${lon.toFixed(2)}`;
      const cachedWeather = weatherCache.get(key);
      if (cachedWeather) return cachedWeather;

      const request = fetchOpenMeteoWeather(lat, lon).catch(() => null);
      weatherCache.set(key, request);
      return request;
    }

    const outcomes = await mapWithConcurrency(
      incidents.filter((inc) => isPortugalCoordinate(inc.latitude, inc.longitude)),
      MAX_CONCURRENCY,
      async (inc): Promise<[string, RiskResponse | null]> => {
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
      },
    );

    const risks = Object.fromEntries(
      outcomes.filter(([, r]) => r !== null),
    ) as Record<string, RiskResponse>;
    const fetchedAt = new Date().toISOString();
    const state = Object.keys(risks).length === 0 ? "empty" : "healthy";

    return NextResponse.json(
      {
        risks,
        fetchedAt,
        dataState: createDataStateMeta(
          state,
          state === "empty" ? "No usable incident risk records" : undefined,
          fetchedAt,
          "lumes-risk",
        ),
      },
      {
        headers: {
          "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
        },
      }
    );
  } catch (err: unknown) {
    logServerFailure("incident-risks.fetch", err, { route: "/api/incidents/risks", retryable: true });
    return NextResponse.json(
      { error: "Incident risk data is temporarily unavailable.", risks: {}, dataState: createDataStateMeta("retryable-error", "Risk sources unavailable") },
      { status: 502, headers: { "Cache-Control": "no-store" } },
    );
  }
}
