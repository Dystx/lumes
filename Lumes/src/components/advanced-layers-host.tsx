"use client";
// AdvancedMapLayers — hosts the lazy-loaded advanced map overlays.
// State lives at the page level so the sidebar can render inline toggle
// controls; this component just renders the actual maplibre layers.

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import type { Map as MaplibreMap } from "maplibre-gl";
import type { Language } from "@/lib/i18n";
import type { AerialLayerStatus } from "@/lib/aerial/status";
import {
  MAP_READY_EVENT,
  MAP_STYLE_TRANSITION_EVENT,
  MAP_STYLE_RESTORED_EVENT,
  type LumesMapEventDetail,
} from "@/lib/map/map-events";
import { createDeferredRestoreScheduler } from "@/lib/map/style-transition";

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

export default function AdvancedMapLayers({
  flags,
  lang,
  onAerialStatusChange,
}: {
  flags: AdvancedLayerFlags;
  lang: Language;
  onAerialStatusChange?: (status: AerialLayerStatus | null) => void;
}) {
  const [map, setMap] = useState<MaplibreMap | null>(null);

  useEffect(() => {
    const restoreScheduler = createDeferredRestoreScheduler<MaplibreMap>(
      (callback) => window.setTimeout(callback, 0),
      (handle) => window.clearTimeout(handle as number),
      (nextMap) => setMap(nextMap),
    );

    const onReady = (e: Event) => {
      const detail = (e as CustomEvent<LumesMapEventDetail>).detail;
      restoreScheduler.cancel();
      setMap(detail.map);
    };
    const onStyleRestored = (e: Event) => {
      const detail = (e as CustomEvent<LumesMapEventDetail>).detail;
      // Force the lazy layer hosts to re-run against the rebuilt style. The
      // map instance stays the same; only its custom sources/layers were
      // cleared by setStyle.
      setMap(null);
      restoreScheduler.schedule(detail.map);
    };
    const onStyleTransition = () => {
      restoreScheduler.cancel();
      setMap(null);
    };
    window.addEventListener(MAP_READY_EVENT, onReady as EventListener);
    window.addEventListener(MAP_STYLE_TRANSITION_EVENT, onStyleTransition as EventListener);
    window.addEventListener(MAP_STYLE_RESTORED_EVENT, onStyleRestored as EventListener);
    return () => {
      restoreScheduler.cancel();
      window.removeEventListener(MAP_READY_EVENT, onReady as EventListener);
      window.removeEventListener(MAP_STYLE_TRANSITION_EVENT, onStyleTransition as EventListener);
      window.removeEventListener(MAP_STYLE_RESTORED_EVENT, onStyleRestored as EventListener);
    };
  }, []);

  useEffect(() => {
    if (!flags.aerial) onAerialStatusChange?.(null);
  }, [flags.aerial, onAerialStatusChange]);

  if (!map) return null;
  return (
    <>
      {flags.biomass && <BiomassLayer map={map} enabled={flags.biomass} lang={lang} />}
      {flags.risk && <RiskLayer map={map} enabled={flags.risk} lang={lang} />}
      {flags.aerial && (
        <AerialLayer
          map={map}
          enabled={flags.aerial}
          onStatusChange={onAerialStatusChange}
        />
      )}
    </>
  );
}
