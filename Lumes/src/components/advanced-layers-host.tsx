"use client";
// AdvancedMapLayers — hosts the lazy-loaded advanced map overlays.
// State lives at the page level so the sidebar can render inline toggle
// controls; this component just renders the actual maplibre layers.

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import type { Map as MaplibreMap } from "maplibre-gl";

const BiomassLayer = dynamic(() => import("./layers/biomass-layer"), {
  ssr: false,
  loading: () => null,
});
const RiskLayer = dynamic(() => import("./layers/risk-layer"), {
  ssr: false,
  loading: () => null,
});
const AerialLayer = dynamic(() => import("./layers/aerial-layer"), {
  ssr: false,
  loading: () => null,
});

export interface AdvancedLayerFlags {
  biomass: boolean;
  risk: boolean;
  aerial: boolean;
}

export default function AdvancedMapLayers({ flags }: { flags: AdvancedLayerFlags }) {
  const [map, setMap] = useState<MaplibreMap | null>(null);

  useEffect(() => {
    const onReady = (e: Event) => {
      const detail = (e as CustomEvent).detail as { map: MaplibreMap };
      setMap(detail.map);
    };
    window.addEventListener("lumes:map-ready", onReady as EventListener);
    return () => window.removeEventListener("lumes:map-ready", onReady as EventListener);
  }, []);

  if (!map) return null;
  return (
    <>
      {flags.biomass && <BiomassLayer map={map} enabled={flags.biomass} />}
      {flags.risk && <RiskLayer map={map} enabled={flags.risk} />}
      {flags.aerial && <AerialLayer map={map} enabled={flags.aerial} />}
    </>
  );
}