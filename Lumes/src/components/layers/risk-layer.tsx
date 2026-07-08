"use client";
// Lazy-loaded composite fire-risk overlay.
//
// Strategy: we don't compute the risk per-pixel on the client; instead
// we hit /api/risk once per viewport (with the viewport's center) and
// show that. The cell-level rendering is reserved for the per-incident
// variant that uses /api/risk?lat=&lon=&incidentId=.
//
// Visualisation: a single red glow at the viewport center scaled by
// current risk; an info chip in the corner summarising the value.

import { useEffect, useState } from "react";
import type { Map as MaplibreMap } from "maplibre-gl";

interface Props {
  map: MaplibreMap | null;
  enabled: boolean;
}

interface RiskSnapshot {
  score: number;
  category: "low" | "moderate" | "high" | "very_high" | "extreme";
  fetchedAt: string;
  ignition: number;
  intensity: number;
}

const RISK_COLORS: Record<RiskSnapshot["category"], string> = {
  low: "#22c55e",
  moderate: "#eab308",
  high: "#ea580c",
  very_high: "#9f1239",
  extreme: "#581c87",
};

const SOURCE_ID = "risk-overlay";
const POINT_LAYER = "risk-point";

export default function RiskLayer({ map, enabled }: Props) {
  const [snapshot, setSnapshot] = useState<RiskSnapshot | null>(null);

  // Fetch risk snapshot for the current map center.
  useEffect(() => {
    if (!map || !enabled) return;
    let cancelled = false;
    let interval: ReturnType<typeof setInterval> | null = null;

    const fetchRisk = async () => {
      const c = map.getCenter();
      try {
        const r = await fetch(`/api/risk?lat=${c.lat}&lon=${c.lng}`);
        if (!r.ok) return;
        const data = await r.json();
        if (cancelled) return;
        const risk = data?.risk;
        if (!risk) return;
        const snap: RiskSnapshot = {
          score: risk.score,
          category: risk.category,
          fetchedAt: data.fetchedAt ?? new Date().toISOString(),
          ignition: risk.ignitionLikelihood ?? 0,
          intensity: risk.intensityPotential ?? 0,
        };
        setSnapshot(snap);
        // Place a marker at the viewport center on the map.
        const feature = {
          type: "Feature" as const,
          geometry: {
            type: "Point" as const,
            coordinates: [c.lng, c.lat],
          },
          properties: { score: snap.score, category: snap.category },
        };
        const src = map.getSource(SOURCE_ID) as { setData: (d: unknown) => void } | undefined;
        if (src) {
          src.setData({ type: "FeatureCollection", features: [feature] });
          return;
        }
        map.addSource(SOURCE_ID, { type: "geojson", data: { type: "FeatureCollection", features: [feature] } });
        map.addLayer({
          id: POINT_LAYER,
          type: "circle",
          source: SOURCE_ID,
          paint: {
            "circle-radius": 24,
            "circle-color": RISK_COLORS[snap.category],
            "circle-opacity": 0.5,
            "circle-stroke-color": RISK_COLORS[snap.category],
            "circle-stroke-width": 2,
            "circle-stroke-opacity": 0.8,
          },
        });
      } catch {
        // silent
      }
    };

    void fetchRisk();
    interval = setInterval(fetchRisk, 5 * 60 * 1000); // refresh every 5 min
    const onMove = () => void fetchRisk();
    map.on("moveend", onMove);

    return () => {
      cancelled = true;
      if (interval) clearInterval(interval);
      map.off("moveend", onMove);
      try {
        if (map.getLayer(POINT_LAYER)) map.removeLayer(POINT_LAYER);
        if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID);
      } catch {
        // ignored
      }
    };
  }, [map, enabled]);

  if (!enabled || !snapshot) return null;

  return (
    <div className="pointer-events-auto absolute left-4 bottom-20 z-30 max-w-xs rounded-lg bg-zinc-900/90 px-3 py-2 text-zinc-100 shadow-lg ring-1 ring-zinc-700 backdrop-blur">
      <div className="flex items-baseline gap-2">
        <span
          className="text-2xl font-bold tabular-nums"
          style={{ color: RISK_COLORS[snapshot.category] }}
        >
          {snapshot.score.toFixed(0)}
        </span>
        <span className="text-xs uppercase tracking-wider text-zinc-400">
          risk score
        </span>
      </div>
      <div className="mt-1 text-xs text-zinc-300">
        categoria{" "}
        <span
          className="font-medium"
          style={{ color: RISK_COLORS[snapshot.category] }}
        >
          {snapshot.category}
        </span>
        {" · "}
        ignição{" "}
        <span className="font-medium">{Math.round(snapshot.ignition * 100)}%</span>
        {" · "}
        intensidade{" "}
        <span className="font-medium">{Math.round(snapshot.intensity * 100)}%</span>
      </div>
      <div className="mt-1 text-[10px] text-zinc-500">
        bioma × meteorologia ao centro do mapa · atualizado{" "}
        {new Date(snapshot.fetchedAt).toLocaleTimeString("pt-PT")}
      </div>
    </div>
  );
}
