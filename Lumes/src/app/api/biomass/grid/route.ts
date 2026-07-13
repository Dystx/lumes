// GET /api/biomass/grid?bbox=W,S,E,N
//
// Returns the synthetic biomass grid cells in a bbox as GeoJSON.
// Used by the lazy-loaded biomass overlay on the map.

import { NextRequest, NextResponse } from "next/server";
import { getSyntheticBiomassGrid, gridInBbox } from "@/lib/biomass/synthetic-grid";
import { cached } from "@/lib/api/cache";
import { createDataStateMeta } from "@/lib/data-state";
import { logServerFailure } from "@/lib/observability";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function parseBbox(s: string | null): [number, number, number, number] | null {
  if (!s) return null;
  const parts = s.split(",").map(Number);
  if (parts.length !== 4 || parts.some(Number.isNaN)) return null;
  const [west, south, east, north] = parts;
  if (west >= east || south >= north) return null;
  if (west < -180 || east > 180 || south < -90 || north > 90) return null;
  return [west, south, east, north];
}

const PORTUGAL_BBOX: [number, number, number, number] = [-9.5, 36.95, -6.0, 42.15];

interface GeoJSONFeatureCollection {
  type: "FeatureCollection";
  bbox: [number, number, number, number];
  cellCount: number;
  features: Array<{
    type: "Feature";
    geometry: { type: "Point"; coordinates: [number, number] };
    properties: {
      tonsPerHectare: number;
      species: string;
      speciesLabel: string;
      rateOfSpread: string;
      fuelModel: string;
    };
  }>;
  source: string;
  dataState?: ReturnType<typeof createDataStateMeta>;
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const rawBbox = url.searchParams.get("bbox");
  const parsedBbox = parseBbox(rawBbox);
  if (rawBbox !== null && parsedBbox === null) {
    return NextResponse.json(
      { error: "bbox must be west,south,east,north with finite ordered coordinates", dataState: createDataStateMeta("empty", "Invalid bounding box") },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }
  const bbox = parsedBbox ?? PORTUGAL_BBOX;
  const bboxStr = bbox.join(",");

  try {
    const data = await cached(`biomass-grid-${bboxStr}`, 24 * 60 * 60 * 1000, async () => {
      const allCells = getSyntheticBiomassGrid();
      const cells = gridInBbox(allCells, bbox);

      const features = cells.map((c) => ({
        type: "Feature" as const,
        geometry: {
          type: "Point" as const,
          coordinates: [c.lon, c.lat] as [number, number],
        },
        properties: {
          tonsPerHectare: c.tonsPerHectare,
          species: c.dominantSpecies,
          speciesLabel: c.profile.pt,
          rateOfSpread: c.profile.rateOfSpread,
          fuelModel: c.profile.fuelModel,
        },
      }));

      const data: GeoJSONFeatureCollection = {
        type: "FeatureCollection",
        bbox,
        cellCount: cells.length,
        features,
        source: "synthetic (replace with ICNF IFN5 when wired)",
        dataState: createDataStateMeta(cells.length === 0 ? "empty" : "healthy", undefined, new Date().toISOString(), "synthetic-biomass"),
      };
      return data;
    });

    return NextResponse.json(data, {
      headers: {
        "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800",
      },
    });
  } catch (err: unknown) {
    logServerFailure("biomass-grid.fetch", err, { route: "/api/biomass/grid", retryable: true });
    const fetchedAt = new Date().toISOString();
    return NextResponse.json(
      {
        type: "FeatureCollection",
        bbox,
        cellCount: 0,
        features: [],
        source: "synthetic (replace with ICNF IFN5 when wired)",
        error: "Biomass grid data is temporarily unavailable.",
        dataState: createDataStateMeta("retryable-error", "Biomass grid source unavailable", fetchedAt, "synthetic-biomass"),
      },
      { status: 502, headers: { "Cache-Control": "no-store" } },
    );
  }
}
