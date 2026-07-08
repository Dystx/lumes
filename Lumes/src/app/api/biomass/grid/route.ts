// GET /api/biomass/grid?bbox=W,S,E,N
//
// Returns the synthetic biomass grid cells in a bbox as GeoJSON.
// Used by the lazy-loaded biomass overlay on the map.

import { NextRequest, NextResponse } from "next/server";
import { getSyntheticBiomassGrid, gridInBbox } from "@/lib/biomass/synthetic-grid";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseBbox(s: string | null): [number, number, number, number] | null {
  if (!s) return null;
  const parts = s.split(",").map(Number);
  if (parts.length !== 4 || parts.some(Number.isNaN)) return null;
  return parts as [number, number, number, number];
}

const PORTUGAL_BBOX: [number, number, number, number] = [-9.5, 36.95, -6.0, 42.15];

let cache: { bboxStr: string; ts: number; data: GeoJSONFeatureCollection } | null = null;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

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
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const bbox = parseBbox(url.searchParams.get("bbox")) ?? PORTUGAL_BBOX;
  const bboxStr = bbox.join(",");

  if (cache && cache.bboxStr === bboxStr && Date.now() - cache.ts < CACHE_TTL_MS) {
    return NextResponse.json(cache.data, {
      headers: {
        "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800",
      },
    });
  }

  const allCells = getSyntheticBiomassGrid();
  const cells = gridInBbox(allCells, bbox);

  const features = cells.map((c) => ({
    type: "Feature" as const,
    geometry: {
      type: "Point" as const,
      coordinates: [c.lon, c.lat],
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
  };
  cache = { bboxStr, ts: Date.now(), data };

  return NextResponse.json(data, {
    headers: {
      "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800",
    },
  });
}
