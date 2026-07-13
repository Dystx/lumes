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
import { classifyDataState, createDataStateMeta } from "@/lib/data-state";
import { logServerFailure } from "@/lib/observability";
import type { RegionalCommandCoordinate, RegionalCommandGeometry, RegionalCommandsResponse } from "@/lib/types";

const ANEPC_REGIONAL_SERVER =
  "https://services-eu1.arcgis.com/VlrHb7fn5ewYhX6y/arcgis/rest/services/Comandos%20Regionais%20ANEPC/FeatureServer/0";

const CACHE_KEY = "regional-commands";
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

interface ArcGisFeature {
  properties?: Record<string, unknown>;
  geometry?: { type?: unknown; coordinates?: unknown };
}

interface ArcGisFeatureCollection {
  features: ArcGisFeature[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function asFeatureCollection(value: unknown): ArcGisFeatureCollection {
  if (!isRecord(value) || !Array.isArray(value.features)) return { features: [] };
  return {
    features: value.features.filter(isRecord).map((feature) => ({
      properties: isRecord(feature.properties) ? feature.properties : undefined,
      geometry: isRecord(feature.geometry)
        ? { type: feature.geometry.type, coordinates: feature.geometry.coordinates }
        : undefined,
    })),
  };
}

// Round coordinates to 4 decimal places (≈11 m precision)
// Simple dependency-free alternative to @turf/simplify for the
// relatively coarse regional command polygons.
function roundCoords(coords: unknown, precision = 4): RegionalCommandCoordinate[] | null {
  if (!Array.isArray(coords) || coords.length === 0) return null;

  if (coords.every((coordinate) => typeof coordinate === "number")) {
    if (coords.length !== 2 || coords.some((coordinate) => !Number.isFinite(coordinate))) return null;
    return coords.map((coordinate) => Number(coordinate.toFixed(precision))) as number[];
  }

  const nested = coords.map((coordinate) => roundCoords(coordinate, precision));
  if (nested.some((coordinate) => coordinate === null)) return null;
  return nested as RegionalCommandCoordinate[];
}

function simplifyGeometry(
  geom: ArcGisFeature["geometry"],
  include: boolean,
  precision = 4,
): RegionalCommandGeometry | null {
  if (!geom || !include) return null;
  const coordinates = roundCoords(geom.coordinates, precision);
  if (!coordinates) return null;
  return {
    type: typeof geom.type === "string" ? geom.type : "GeometryCollection",
    coordinates,
  };
}

async function fetchCommands(): Promise<ArcGisFeatureCollection> {
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
    signal: AbortSignal.timeout(8_000),
  });
  if (!res.ok) throw new Error(`ANEPC HTTP ${res.status}`);
  return asFeatureCollection(await res.json());
}

export async function GET(req: NextRequest) {
  const includeGeometry = req.nextUrl.searchParams.get("geometry") === "1";
  const cacheKey = `${CACHE_KEY}:geo=${includeGeometry ? "1" : "0"}`;

  try {
    const data = await cached(
      cacheKey,
      CACHE_TTL_MS,
      async () => {
        const raw = await fetchCommands();
        const commands = raw.features.map((feature, index) => {
          const properties = feature.properties ?? {};
          const commandName = typeof properties.ComReg === "string" ? properties.ComReg : "Regional command";
          const rawId = properties.ID ?? properties.FID ?? index;
          const area = typeof properties.Shape__Area === "number" ? properties.Shape__Area : undefined;
          return {
            id: `anepc-cmd-${String(rawId)}`,
            name: commandName,
            region: commandName,
            ...(area !== undefined ? { area } : {}),
            geometry: simplifyGeometry(feature.geometry, includeGeometry),
          };
        });
        const fetchedAt = new Date().toISOString();
        const body: RegionalCommandsResponse = {
          source: "anepc-regional-commands",
          fetchedAt,
          count: commands.length,
          commands,
          dataState: createDataStateMeta(
            classifyDataState({ count: commands.length }),
            undefined,
            fetchedAt,
            "anepc-regional-commands",
          ),
        };
        return body;
      },
    );

    return NextResponse.json(data, {
      headers: {
        // 24h CDN cache + 7d stale-while-revalidate
        "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800",
      },
    });
  } catch (err: unknown) {
    logServerFailure("regional-commands.fetch", err, { route: "/api/regional-commands", retryable: true });
    return NextResponse.json(
      {
        source: "anepc-regional-commands",
        count: 0,
        commands: [],
        error: "Regional command data is temporarily unavailable.",
        dataState: createDataStateMeta("retryable-error", "Regional command source unavailable", undefined, "anepc-regional-commands"),
      },
      { status: 502, headers: { "Cache-Control": "no-store" } },
    );
  }
}
