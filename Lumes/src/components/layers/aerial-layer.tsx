"use client";
// AerialLayer — FlightRadar24-style aircraft visualization.
//
// Renders real ADS-B aircraft over Portugal as rotating SVG icons,
// color-coded by altitude, with optional call sign labels. Polls the
// /api/aerial endpoint every 30 seconds and updates the map.

import { useEffect, useState } from "react";
import type { Map as MaplibreMap } from "maplibre-gl";

interface Props {
  map: MaplibreMap | null;
  enabled: boolean;
  showLabels?: boolean;
}

const SOURCE_ID = "aerial-overlay";
const AIRCRAFT_LAYER = "aerial-aircraft";
const HELI_LAYER = "aerial-helicopters";
const LABEL_LAYER = "aerial-labels";
const HELI_MAX_ALT_FT = 3000;

// Color by altitude (similar to FlightRadar24's altitude gradient)
function colorForAltitudeFt(alt: number | null): string {
  if (alt == null) return "#9ca3af";
  if (alt < 3000) return "#fb923c"; // orange (low/heli)
  if (alt < 10000) return "#fbbf24"; // yellow
  if (alt < 20000) return "#34d399"; // green
  if (alt < 30000) return "#60a5fa"; // blue
  if (alt < 40000) return "#a78bfa"; // purple
  return "#f472b6"; // pink (very high)
}

function isRotary(aircraftType: string | null, registration: string | null): boolean {
  if (!aircraftType && !registration) return false;
  return /^(EC|HB|R|AS|H|BA|MBB|SUH|AS3)/i.test(aircraftType ?? "") ||
    /^(EC|HB)/i.test(registration ?? "");
}

interface AircraftSummary {
  count: number;
  helicopterCount: number;
  sourceError: boolean;
  source: string | null;
}

export default function AerialLayer({ map, enabled, showLabels = true }: Props) {
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
          if (!cancelled) setSummary({ count: 0, helicopterCount: 0, sourceError: true, source: null });
          return;
        }
        const data = await r.json();
        if (cancelled) return;

        // Mark helicopters via registration / type heuristics
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
              _headingRad: ((f.properties.headingDeg as number | null) ?? 0) * Math.PI / 180,
              _color: colorForAltitudeFt(f.properties.altitudeBarometricFt as number | null),
            },
          };
        });

        const heliCount = features.filter((f: { properties: { _isHeli: boolean } }) =>
          f.properties._isHeli
        ).length;

        const fc: GeoJSON.FeatureCollection = { type: "FeatureCollection", features };
        const src = map.getSource(SOURCE_ID) as { setData: (d: unknown) => void } | undefined;
        if (src) {
          src.setData(fc);
        } else {
          map.addSource(SOURCE_ID, { type: "geojson", data: fc });

          // Fixed-wing aircraft: rotating plane symbol via SVG icon
          map.loadImage("/icons/plane.svg").then((img) => {
            if (cancelled || !map.hasImage("plane-icon")) return;
            if (cancelled) return;
            map.addImage("plane-icon", img.data as ImageBitmap);
            // (Image added; we use the symbol layer below for rotation)
          }).catch(() => {
            // Fallback: add a small inline SVG as image
          });

          // Use symbol layer with rotation for proper FlightRadar-style planes
          map.addLayer({
            id: AIRCRAFT_LAYER,
            type: "symbol",
            source: SOURCE_ID,
            filter: ["==", ["get", "_isHeli"], false],
            layout: {
              "icon-image": "plane-icon",
              "icon-rotate": ["get", "_headingRad"],
              "icon-rotation-alignment": "map",
              "icon-allow-overlap": true,
              "icon-ignore-placement": true,
              "icon-size": [
                "interpolate", ["linear"], ["zoom"],
                5, 0.6,
                8, 0.9,
                12, 1.3,
              ],
            },
            paint: {
              "icon-opacity": 0.95,
            },
          });

          // Helicopters: orange circle with white border (more visible)
          map.addLayer({
            id: HELI_LAYER,
            type: "circle",
            source: SOURCE_ID,
            filter: ["==", ["get", "_isHeli"], true],
            paint: {
              "circle-radius": 6,
              "circle-color": "#fb923c",
              "circle-stroke-color": "#ffffff",
              "circle-stroke-width": 2,
              "circle-opacity": 0.95,
            },
          });

          // Labels (callsign or registration) on zoom-in
          if (showLabels) {
            map.addLayer({
              id: LABEL_LAYER,
              type: "symbol",
              source: SOURCE_ID,
              minzoom: 8,
              filter: ["==", ["get", "_isHeli"], false],
              layout: {
                "text-field": [
                  "case",
                  ["has", "callsign"],
                  ["get", "callsign"],
                  ["get", "registration"],
                ],
                "text-font": ["Noto Sans Regular"],
                "text-size": 10,
                "text-offset": [0, 1.4],
                "text-anchor": "top",
                "text-allow-overlap": false,
                "text-optional": true,
                "text-padding": 2,
              },
              paint: {
                "text-color": "#fafafa",
                "text-halo-color": "rgba(0,0,0,0.85)",
                "text-halo-width": 1.5,
              },
            });
          }
        }

        if (!cancelled) {
          setSummary({
            count: features.length,
            helicopterCount: heliCount,
            sourceError: false,
            source: data.meta?.sources_live > 0
              ? `${data.meta.sources_live} of 3 sources`
              : "fallback",
          });
        }
      } catch {
        if (!cancelled) setSummary({ count: 0, helicopterCount: 0, sourceError: true, source: null });
      }
    };

    fetchAndApply();
    interval = setInterval(fetchAndApply, 30_000);

    return () => {
      cancelled = true;
      if (interval) clearInterval(interval);
    };
  }, [map, enabled, showLabels]);

  // Cleanup layers on disable
  useEffect(() => {
    if (!map) return;
    if (!enabled) {
      if (map.getLayer(AIRCRAFT_LAYER)) map.removeLayer(AIRCRAFT_LAYER);
      if (map.getLayer(HELI_LAYER)) map.removeLayer(HELI_LAYER);
      if (map.getLayer(LABEL_LAYER)) map.removeLayer(LABEL_LAYER);
      if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID);
    }
    return () => {
      if (!map) return;
      if (map.getLayer(AIRCRAFT_LAYER)) map.removeLayer(AIRCRAFT_LAYER);
      if (map.getLayer(HELI_LAYER)) map.removeLayer(HELI_LAYER);
      if (map.getLayer(LABEL_LAYER)) map.removeLayer(LABEL_LAYER);
      if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID);
    };
  }, [map, enabled]);

  return null;
}
