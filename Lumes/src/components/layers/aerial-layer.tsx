"use client";
// Lazy-loaded aerial response layer.
// Polls /api/aerial?bbox=<viewport> every 30 s while enabled, renders
// aircraft as circle + label markers colored by altitude category.

import { useEffect, useState } from "react";
import type { Map as MaplibreMap } from "maplibre-gl";

interface Props {
  map: MaplibreMap | null;
  enabled: boolean;
}

const SOURCE_ID = "aerial-overlay";
const AIRCRAFT_LAYER = "aerial-aircraft";
const HELI_LAYER = "aerial-helicopters";
const HELI_MAX_ALT_FT = 3000;

function colorForAltitudeFt(alt: number | null): string {
  if (alt == null) return "#71717a";
  if (alt < HELI_MAX_ALT_FT) return "#fb923c"; // helicopter-candidate, orange
  if (alt < 10000) return "#a3a3a3"; // medium, grey
  return "#52525b"; // high, dark grey
}

function isRotary(aircraftType: string | null, registration: string | null): boolean {
  if (!aircraftType) return false;
  return /^(EC|HB|R|AS|H|BA|MBB|SUH|AS3)/i.test(aircraftType);
}

interface AircraftSummary {
  count: number;
  helicopterCount: number;
  sourceError: boolean;
}

export default function AerialLayer({ map, enabled }: Props) {
  const [summary, setSummary] = useState<AircraftSummary | null>(null);

  useEffect(() => {
    if (!map || !enabled) return;
    let cancelled = false;
    let interval: ReturnType<typeof setInterval> | null = null;

    const fetchAndApply = async () => {
      const b = map.getBounds();
      const bbox = `${b.getWest()},${b.getSouth()},${b.getEast()},${b.getNorth()}`;
      try {
        const r = await fetch(`/api/aerial?bbox=${bbox}`);
        if (!r.ok) {
          if (!cancelled) setSummary({ count: 0, helicopterCount: 0, sourceError: true });
          return;
        }
        const data = await r.json();
        if (cancelled) return;

        // Mark helicopters via registration / type heuristics so the
        // operator can spot what's potentially airborne fire response.
        const features = (data.features ?? []).map((f: {
          type: string;
          geometry: { type: string; coordinates: [number, number, number | null] };
          properties: Record<string, unknown>;
        }) => {
          const acType = (f.properties.aircraftType as string | null) ?? null;
          const reg = (f.properties.registration as string | null) ?? null;
          return {
            ...f,
            properties: {
              ...f.properties,
              _isHeli: isRotary(acType, reg),
            },
          };
        });

        const heliCount = features.filter((f: { properties: { _isHeli: boolean } }) =>
          f.properties._isHeli
        ).length;

        const fc = { type: "FeatureCollection", features };
        const src = map.getSource(SOURCE_ID) as { setData: (d: unknown) => void } | undefined;
        if (src) {
          src.setData(fc);
        } else {
          map.addSource(SOURCE_ID, { type: "geojson", data: fc });
          map.addLayer({
            id: AIRCRAFT_LAYER,
            type: "circle",
            source: SOURCE_ID,
            filter: ["==", ["get", "_isHeli"], false],
            paint: {
              "circle-radius": 3,
              "circle-color": [
                "case",
                ["has", "altitudeBarometricFt"],
                [
                  "interpolate", ["linear"], ["get", "altitudeBarometricFt"],
                  0, "#71717a",
                  5000, "#a1a1aa",
                  15000, "#fafafa",
                ],
                "#71717a",
              ],
              "circle-stroke-width": 0.5,
              "circle-stroke-color": "#18181b",
            },
          });
          map.addLayer({
            id: HELI_LAYER,
            type: "circle",
            source: SOURCE_ID,
            filter: ["==", ["get", "_isHeli"], true],
            paint: {
              "circle-radius": 7,
              "circle-color": "#fb923c",
              "circle-stroke-color": "#7c2d12",
              "circle-stroke-width": 2,
              "circle-opacity": 0.85,
            },
          });
        }

        if (!cancelled) {
          setSummary({
            count: features.length,
            helicopterCount: heliCount,
            sourceError: false,
          });
        }
      } catch {
        if (!cancelled) setSummary({ count: 0, helicopterCount: 0, sourceError: true });
      }
    };

    void fetchAndApply();
    interval = setInterval(fetchAndApply, 30_000); // refresh every 30 s
    const onMove = () => {
      // Debounce: only refetch on substantial moves
    };
    map.on("moveend", () => setTimeout(fetchAndApply, 1500));

    return () => {
      cancelled = true;
      if (interval) clearInterval(interval);
      map.off("moveend", onMove as never);
      try {
        if (map.getLayer(AIRCRAFT_LAYER)) map.removeLayer(AIRCRAFT_LAYER);
        if (map.getLayer(HELI_LAYER)) map.removeLayer(HELI_LAYER);
        if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID);
      } catch {
        // map may already be torn down
      }
    };
  }, [map, enabled]);

  if (!enabled || !summary) return null;

  return (
    <div className="pointer-events-auto absolute right-4 bottom-20 z-30 max-w-xs rounded-lg bg-zinc-900/90 px-3 py-2 text-zinc-100 shadow-lg ring-1 ring-zinc-700 backdrop-blur">
      <div className="flex items-baseline gap-2">
        <span className="text-2xl font-bold tabular-nums">{summary.count}</span>
        <span className="text-xs uppercase tracking-wider text-zinc-400">
          aeronaves no mapa
        </span>
      </div>
      {summary.helicopterCount > 0 && (
        <div className="mt-1 text-xs text-zinc-300">
          <span className="font-medium text-orange-400">
            {summary.helicopterCount}
          </span>{" "}
          baixa altitude (possível rotor)
        </div>
      )}
      <div className="mt-1 text-[10px] text-zinc-500">
        ADS-B · adsb.fi + airplanes.live + OpenSky · auto-refresh 30 s
        {summary.sourceError && " · fontes offline"}
      </div>
    </div>
  );
}
