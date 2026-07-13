"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import type { MapSceneProps } from "@/components/map/map-scene";

const MAP_START_DELAY_MS = 1500;

const MapScene = dynamic(
  () => import("@/components/map/map-scene").then((mod) => mod.MapScene),
  {
    ssr: false,
    loading: () => <div className="absolute inset-0 bg-[var(--ember-map-bg)]" aria-hidden="true" />,
  },
);

/**
 * Keeps the existing operational map contract while moving MapLibre startup
 * out of the initial page's critical main-thread window.
 */
export function DeferredMapScene(props: MapSceneProps): React.JSX.Element {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let idleId: number | null = null;
    let idleCancelTimer: number | null = null;

    const start = () => {
      if (!cancelled) setReady(true);
    };

    const timer = window.setTimeout(() => {
      if ("requestIdleCallback" in window) {
        idleId = window.requestIdleCallback(start, { timeout: 1000 });
        idleCancelTimer = window.setTimeout(() => {
          if (idleId !== null) {
            window.cancelIdleCallback(idleId);
            idleId = null;
          }
        }, 1000);
      } else {
        start();
      }
    }, MAP_START_DELAY_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      if (idleCancelTimer !== null) window.clearTimeout(idleCancelTimer);
      if (idleId !== null) window.cancelIdleCallback(idleId);
    };
  }, []);

  if (!ready) {
    return <div className="absolute inset-0 bg-[var(--ember-map-bg)]" aria-hidden="true" />;
  }

  return <MapScene {...props} />;
}
