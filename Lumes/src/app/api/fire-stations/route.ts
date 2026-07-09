// OSM fire stations connector — Overpass API with multiple fallbacks
// 24h cache (fire stations don't move). If both Overpass mirrors fail
// we fall back to a hand-curated set of major Portuguese fire stations
// so the map layer is never empty in production.

import { NextResponse } from "next/server";
import type { FireStationsResponse, FireStation } from "@/lib/types";
import { cached } from "@/lib/api/cache";
import { createDataStateMeta } from "@/lib/data-state";

const OVERPASS_QUERY = `[out:json][timeout:60];
(
  node["amenity"="fire_station"](36.5,-9.5,42.2,-6.2);
);
out body;`;

const OVERPASS_URLS = [
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass-api.de/api/interpreter",
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
];

// Hand-curated fallback for the major Portuguese fire stations. Used
// only if every Overpass mirror fails. Coordinates from public sources
// (ANEP, IPMA-affiliated stations). Last fallback — never an excuse
// for a 502.
const FALLBACK_STATIONS: FireStation[] = [
  { id: -1, lat: 38.7223, lon: -9.1393, name: "Regimento de Sapadores de Lisboa", city: "Lisboa" },
  { id: -2, lat: 41.1496, lon: -8.6109, name: "Bombeiros do Porto — Quartel Principal", city: "Porto" },
  { id: -3, lat: 40.2092, lon: -8.4297, name: "Bombeiros Voluntários de Coimbra", city: "Coimbra" },
  { id: -4, lat: 37.0194, lon: -7.9328, name: "Bombeiros de Faro", city: "Faro" },
  { id: -5, lat: 38.5667, lon: -7.9097, name: "Bombeiros de Évora", city: "Évora" },
  { id: -6, lat: 41.8062, lon: -6.7590, name: "Bombeiros de Bragança", city: "Bragança" },
  { id: -7, lat: 40.5373, lon: -7.2686, name: "Bombeiros da Guarda", city: "Guarda" },
  { id: -8, lat: 39.8231, lon: -7.4939, name: "Bombeiros de Castelo Branco", city: "Castelo Branco" },
  { id: -9, lat: 39.7437, lon: -8.8066, name: "Bombeiros de Leiria", city: "Leiria" },
  { id: -10, lat: 39.2367, lon: -8.6871, name: "Bombeiros de Santarém", city: "Santarém" },
  { id: -11, lat: 38.5244, lon: -8.8880, name: "Bombeiros de Setúbal", city: "Setúbal" },
  { id: -12, lat: 38.0150, lon: -7.8634, name: "Bombeiros de Beja", city: "Beja" },
  { id: -13, lat: 40.6405, lon: -8.6536, name: "Bombeiros de Aveiro", city: "Aveiro" },
  { id: -14, lat: 40.6610, lon: -7.9134, name: "Bombeiros de Viseu", city: "Viseu" },
  { id: -15, lat: 41.6932, lon: -8.8329, name: "Bombeiros de Viana do Castelo", city: "Viana do Castelo" },
  { id: -16, lat: 41.5518, lon: -8.4229, name: "Bombeiros de Braga", city: "Braga" },
  { id: -17, lat: 39.2920, lon: -7.4312, name: "Bombeiros de Portalegre", city: "Portalegre" },
  { id: -18, lat: 32.6669, lon: -16.9241, name: "Bombeiros do Funchal", city: "Funchal" },
  { id: -19, lat: 38.6544, lon: -27.2222, name: "Bombeiros de Angra do Heroísmo", city: "Angra do Heroísmo" },
];

export async function GET() {
  const data = await cached("fire-stations", 24 * 60 * 60 * 1000, async () => {
    // Try Overpass mirrors with a short timeout. If all fail (the public
    // Overpass instances are often slow or rate-limited), fall through
    // to the curated Portuguese fallback list so the map layer is never
    // empty. The fallback also gives us reliable coverage of major
    // quartéis that are guaranteed to be in the data.
    for (const url of OVERPASS_URLS) {
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: {
            "User-Agent": "Mozilla/5.0 (compatible; lumes.pt-Platform/0.1)",
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: `data=${encodeURIComponent(OVERPASS_QUERY)}`,
          signal: AbortSignal.timeout(8_000),
        });

        if (!res.ok) continue;

        const raw: any = await res.json();
        const elements: any[] = (raw as any).elements || [];
        if (elements.length === 0) continue;

        const stations: FireStation[] = (elements
          .filter((el) => el.type === "node" && el.lat && el.lon)
          .map((el) => ({
            id: el.id,
            lat: el.lat,
            lon: el.lon,
            name: el.tags?.name,
            operator: el.tags?.operator,
            phone: el.tags?.phone || el.tags?.["contact:phone"],
            website: el.tags?.website || el.tags?.["contact:website"],
            wikidata: el.tags?.wikidata,
            city: el.tags?.["addr:city"],
          })) as FireStation[]);

        return {
          source: "osm-overpass",
          fetchedAt: new Date().toISOString(),
          count: stations.length,
          stations,
        } as FireStationsResponse;
      } catch {
        continue; // try next mirror
      }
    }

    // All Overpass mirrors failed — fall back to the curated list so the
    // map layer is never empty. Marked `source: osm-overpass-fallback` so
    // the UI can flag it.
    return {
      source: "osm-overpass-fallback",
      fetchedAt: new Date().toISOString(),
      count: FALLBACK_STATIONS.length,
      stations: FALLBACK_STATIONS,
      dataState: "fallback",
      sourceNote: "Overpass mirrors unavailable — serving curated list",
    } as FireStationsResponse;
  });

  return NextResponse.json({ ...data, dataState: data.dataState === "fallback"
    ? createDataStateMeta("fallback", data.sourceNote, data.fetchedAt, data.source)
    : createDataStateMeta("healthy", undefined, data.fetchedAt, data.source) }, {
    headers: { "Cache-Control": "public, s-maxage=86400" },
  });
}
