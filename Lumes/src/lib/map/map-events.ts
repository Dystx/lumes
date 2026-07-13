import type maplibregl from "maplibre-gl";

export const MAP_READY_EVENT = "lumes:map-ready" as const;
export const MAP_STYLE_TRANSITION_EVENT = "lumes:map-style-transition" as const;
export const MAP_STYLE_RESTORED_EVENT = "lumes:map-style-restored" as const;

export interface LumesMapEventDetail {
  map: maplibregl.Map;
}

export function dispatchMapEvent(
  eventName:
    | typeof MAP_READY_EVENT
    | typeof MAP_STYLE_TRANSITION_EVENT
    | typeof MAP_STYLE_RESTORED_EVENT,
  map: maplibregl.Map,
): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<LumesMapEventDetail>(eventName, { detail: { map } }));
}
