"use client";
// Lazy-loaded biomass overlay.
// Each instance fetches a GeoJSON of biomass cells in the current map
// bounds and renders them as a circle layer colored by tons/hectare.
//
// Click behaviour: identifying tooltips are wired by the layer-panel;
// this component only manages the maplibre source/layer lifecycle.

import { useEffect } from "react";
import type { Map as MaplibreMap } from "maplibre-gl";

const SOURCE_ID = "biomass-overlay";
const LAYER_ID = "biomass-cells";

interface Props {
  map: MaplibreMap | null;
  enabled: boolean;
}

export default function BiomassLayer({ map, enabled }: Props) {
  useEffect(() => {
    if (!map || !enabled) return;
    let cancelled = false;

    const fetchAndApply = async () => {
      const bounds = map.getBounds();
      const bbox = `${bounds.getWest()},${bounds.getSouth()},${bounds.getEast()},${bounds.getNorth()}`;
      const url = `/api/biomass/grid?bbox=${bbox}`;
      try {
        const r = await fetch(url);
        if (!r.ok) return;
        const data = await r.json();
        if (cancelled) return;

        const src = map.getSource(SOURCE_ID) as { setData: (d: unknown) => void } | undefined;
        if (src) {
          src.setData(data);
          return;
        }
        map.addSource(SOURCE_ID, { type: "geojson", data });
        map.addLayer({
          id: LAYER_ID,
          type: "circle",
          source: SOURCE_ID,
          paint: {
            "circle-radius": [
              "interpolate", ["linear"], ["zoom"],
              4, 2,
              8, 5,
              12, 9,
            ],
            "circle-color": [
              "interpolate", ["linear"], ["get", "tonsPerHectare"],
              0, "#1e3a8a",
              30, "#65a30d",
              80, "#eab308",
              120, "#ea580c",
              160, "#9f1239",
            ],
            "circle-opacity": 0.55,
            "circle-stroke-color": "#000",
            "circle-stroke-width": 0.5,
            "circle-stroke-opacity": 0.3,
          },
        });
      } catch {
        // silent — the layer is a nice-to-have, not critical
      }
    };

    void fetchAndApply();
    const onMove = () => {
      if (map.getSource(SOURCE_ID)) void fetchAndApply();
    };
    map.on("moveend", onMove);

    return () => {
      cancelled = true;
      map.off("moveend", onMove);
      try {
        if (map.getLayer(LAYER_ID)) map.removeLayer(LAYER_ID);
        if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID);
      } catch {
        // map may already be torn down
      }
    };
  }, [map, enabled]);

  return null;
}
