// ANEPC Regional Commands — civil protection command centers across Portugal
// Source: https://services-eu1.arcgis.com/VlrHb7fn5ewYhX6y/arcgis/rest/services/Comandos%20Regionais%20ANEPC/FeatureServer/0
// Returns 5 regional commands (Norte, Centro, Lisboa, Alentejo, Algarve).
//
// Optimisations (F-07):
//   - Geometry OFF by default (was 11 MB response). Pass ?geometry=1 to include.
//   - When included, coordinates rounded to 4 decimal places (~11 m precision).
//   - Cache: 7 days (rarely changes) with s-maxage=86400.
//
// References: https://turfjs.org/docs/api/simplify

import { NextRequest, NextResponse } from "next/server";
import { cached } from "@/lib/api/cache";

const ANEPC_REGIONAL_SERVER =
  "https://services-eu1.arcgis.com/VlrHb7fn5ewYhX6y/arcgis/rest/services/Comandos%20Regionais%20ANEPC/FeatureServer/0";

const CACHE_KEY = "regional-commands";
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// Round coordinates to 4 decimal places (≈11 m precision)
// Simple dependency-free alternative to @turf/simplify for the
// relatively coarse regional command polygons.
function roundCoords(coords: any, precision = 4): any {
  if (Array.isArray(coords[0])) {
    return coords.map((c) => roundCoords(c, precision));
  }
  return [
    Number(coords[0].toFixed(precision)),
    Number(coords[1].toFixed(precision)),
  ];
}

function simplifyGeometry(geom: any, include: boolean, precision = 4) {
  if (!geom || !include) return null;
  return {
    ...geom,
    coordinates: roundCoords(geom.coordinates, precision),
  };
}

async function fetchCommands() {
  const params = new URLSearchParams({
    f: "geojson",
    where: "1=1",
    outFields: "ComReg,Shape__Area",
    returnGeometry: "true",
  });

  const res = await fetch(`${ANEPC_REGIONAL_SERVER}/query?${params}`, {
    headers: {
      "User-Agent": "lumes.pt-Platform/0.1 (wildfire-intel; +contact@lumes.pt)",
      Accept: "application/json, application/geo+json",
    },
  });
  if (!res.ok) throw new Error(`ANEPC HTTP ${res.status}`);
  return res.json();
}

export async function GET(req: NextRequest) {
  const includeGeometry = req.nextUrl.searchParams.get("geometry") === "1";
  const cacheKey = `${CACHE_KEY}:geo=${includeGeometry ? "1" : "0"}`;

  const data = await cached(
    cacheKey,
    CACHE_TTL_MS,
    async () => {
      const raw = await fetchCommands();
      const commands = (raw.features || []).map((f: any) => ({
        id: `anepc-cmd-${f.properties.ID || f.properties.FID}`,
        name: f.properties.ComReg,
        region: f.properties.ComReg,
        area: f.properties.Shape__Area,
        geometry: simplifyGeometry(f.geometry, includeGeometry),
      }));
      return {
        source: "anepc-regional-commands",
        fetchedAt: new Date().toISOString(),
        count: commands.length,
        commands,
      };
    },
  );

  return NextResponse.json(data, {
    headers: {
      // 24h CDN cache + 7d stale-while-revalidate
      "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800",
    },
  });
}