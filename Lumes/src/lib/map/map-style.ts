import type { BasemapMode } from "@/lib/types";

export type { BasemapMode } from "@/lib/types";

export type MapTheme = "dark" | "light";

export function normalizeMapTheme(value: string | undefined): MapTheme {
  return value === "light" ? "light" : "dark";
}

/** CARTO styles used by the single MapLibre instance. */
export const DARK_STYLE =
  "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";
export const LIGHT_STYLE =
  "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json";

/** EOX Sentinel-2 Cloudless imagery layered over the dark base style. */
export const SATELLITE_TILES =
  "https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2020_3857/default/g/{z}/{y}/{x}.jpg";
export const SATELLITE_SOURCE_ID = "eox-s2cloudless";
export const SATELLITE_LAYER_ID = "eox-s2cloudless-bg";

/**
 * MapLibre paint properties cannot resolve CSS variables. Keep these values
 * in one module so the wrapper and its tests share the same source contract.
 */
export const SOURCE_COLORS = {
  dark: {
    satellite: "#ff8a5b",
    official: "#ff6b5b",
    community: "#5dade2",
    news: "#c39bd3",
    weather: "#58d68d",
    evacuation: "#ff6b5b",
  },
  light: {
    satellite: "#ff6a3b",
    official: "#c0392b",
    community: "#2e86c1",
    news: "#8e44ad",
    weather: "#27ae60",
    evacuation: "#c0392b",
  },
} as const;

export function pickStyle(basemap: BasemapMode | "sat", theme: MapTheme): string {
  const normalized = basemap === "sat" ? "satellite" : basemap;
  if (normalized === "satellite") return DARK_STYLE;
  // Satellite mode uses the dark style as a base; the EOX raster is added as
  // a layer rather than replacing the whole style.
  if (normalized === "light" || (normalized === "dark" && theme === "light")) {
    return LIGHT_STYLE;
  }
  return DARK_STYLE;
}

/** Ocean color per theme and basemap, kept separate from raster imagery. */
export function pickWaterColor(theme: MapTheme, basemap: BasemapMode): string {
  if (basemap === "satellite") {
    // Satellite keeps a stable fallback tint if imagery is delayed or absent.
    return theme === "light" ? "#bcd4e6" : "#1e3a5f";
  }
  if (theme === "light") return "#a8c8e8";
  return "#0a2540";
}
