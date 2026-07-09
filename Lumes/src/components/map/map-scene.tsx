"use client";

import { useEffect, useRef, type RefObject } from "react";
import EmberMap, { type EmberMapHandle, type EmberMapProps } from "@/components/ember-map";

export interface MapSceneProps extends EmberMapProps {
  mapRef: RefObject<EmberMapHandle | null>;
}

/** Owns the single MapLibre instance shared by desktop, tablet, and mobile chrome. */
export function MapScene({ mapRef, ...mapProps }: MapSceneProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const resize = () => {
      requestAnimationFrame(() => mapRef.current?.resize());
    };

    const observer = new ResizeObserver(resize);
    observer.observe(container);
    window.addEventListener("resize", resize);
    resize();
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", resize);
    };
  }, [mapRef]);

  return (
    <div ref={containerRef} className="absolute inset-0">
      <EmberMap ref={mapRef} {...mapProps} />
    </div>
  );
}
