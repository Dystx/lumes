"use client";

import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef, useState, forwardRef, useImperativeHandle } from "react";
import type {
  Incident,
  IncidentStatus,
  Severity,
  SourceType,
  VerificationStatus,
} from "@/lib/sample-data";

// ============================================================
// Source IDs — each is an independent GeoJSON source on the map
// ============================================================
export const SOURCE_IDS = {
  incidents: "ember-incidents",
  satellite: "ember-satellite",
  community: "ember-community",
  evacuation: "ember-evacuation",
  selected: "ember-selected",
  fireRisk: "ember-fire-risk",
  fireStations: "ember-fire-stations",
} as const;

// Layer IDs — one or more layers per source
export const LAYER_IDS = {
  incidentFill: "ember-incidents-fill",
  incidentStroke: "ember-incidents-stroke",
  incidentSymbol: "ember-incidents-symbol",
  satelliteDots: "ember-satellite-dots",
  communityDots: "ember-community-dots",
  evacuationFill: "ember-evacuation-fill",
  evacuationStroke: "ember-evacuation-stroke",
  selectedHalo: "ember-selected-halo",
  fireRiskCircles: "ember-fire-risk-circles",
  fireRiskLabels: "ember-fire-risk-labels",
  fireStationsDots: "ember-fire-stations-dots",
  fireStationsLabels: "ember-fire-stations-labels",
} as const;

// ============================================================
// Style URLs — three options now (dark, light, satellite)
// Switched on theme/basemap change without recreating the map instance
// ============================================================
const DARK_STYLE =
  "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";
const LIGHT_STYLE =
  "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json";
// EOX Sentinel-2 Cloudless 2020 — global cloud-free satellite imagery
// Used by GWIS (European Forest Fire Information System) as their basemap
// We add this as a raster layer on top of the dark style (rather than replacing
// the entire style) to avoid losing our ember overlay layers on style swap.
const SATELLITE_TILES = "https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2020_3857/default/g/{z}/{y}/{x}.jpg";
const SATELLITE_SOURCE_ID = "eox-s2cloudless";
const SATELLITE_LAYER_ID = "eox-s2cloudless-bg";

// ============================================================
// Source colors — MapLibre paint properties cannot use CSS vars,
// so we mirror the values here. Keep in sync with globals.css.
// ============================================================
const SOURCE_COLORS = {
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

// ============================================================
// Helpers
// ============================================================

function severityColor(severity: Severity, theme: "dark" | "light"): string {
  const palette = theme === "dark"
    ? { critical: "#ff6b5b", high: "#ffb786", medium: "#5dade2", low: "#58d68d" }
    : { critical: "#c0392b", high: "#d4875a", medium: "#2e86c1", low: "#27ae60" };
  return palette[severity];
}

function statusOpacity(status: IncidentStatus): number {
  switch (status) {
    case "active":
    case "detected":
      return 0.9;
    case "contained":
      return 0.7;
    case "monitoring":
      return 0.5;
    case "resolved":
      return 0.3;
  }
}

function severityRadius(severity: Severity, areaHa: number): number {
  // Base size by severity, scaled slightly by area
  const base = { critical: 22, high: 18, medium: 14, low: 10 }[severity];
  const areaBoost = Math.min(8, Math.sqrt(areaHa) / 6);
  return base + areaBoost;
}

// Convert a distance in km to a circle polygon (GeoJSON) at a given lat/lon
// Used to render approximate incident footprints and evacuation zones
function circlePolygon(
  lat: number,
  lon: number,
  radiusKm: number,
  steps = 48
): GeoJSON.Feature<GeoJSON.Polygon> {
  const coords: [number, number][] = [];
  const earthRadiusKm = 6371;
  for (let i = 0; i <= steps; i++) {
    const bearing = (i * 360) / steps;
    const lat1 = (lat * Math.PI) / 180;
    const lon1 = (lon * Math.PI) / 180;
    const bearingRad = (bearing * Math.PI) / 180;
    const dr = radiusKm / earthRadiusKm;
    const lat2 = Math.asin(
      Math.sin(lat1) * Math.cos(dr) +
        Math.cos(lat1) * Math.sin(dr) * Math.cos(bearingRad)
    );
    const lon2 =
      lon1 +
      Math.atan2(
        Math.sin(bearingRad) * Math.sin(dr) * Math.cos(lat1),
        Math.cos(dr) - Math.sin(lat1) * Math.sin(lat2)
      );
    coords.push([(lon2 * 180) / Math.PI, (lat2 * 180) / Math.PI]);
  }
  return {
    type: "Feature",
    properties: {},
    geometry: { type: "Polygon", coordinates: [coords] },
  };
}

// Build GeoJSON for the incident source (footprint polygons)
function buildIncidentsGeoJSON(
  incidents: Incident[],
  theme: "dark" | "light"
): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: incidents.map((inc) => {
      // Point geometry for symbol layer (fire icons)
      const feature: GeoJSON.Feature<GeoJSON.Point> = {
        type: "Feature",
        geometry: {
          type: "Point",
          coordinates: [inc.longitude, inc.latitude],
        },
        properties: {
          id: inc.id,
          displayName: inc.displayName,
          severity: inc.severity,
          status: inc.status,
          areaHa: inc.estimatedAreaHa,
          confidence: inc.confidence,
          verification: inc.verification,
          sourceCount: inc.sourceCount,
          opacity: statusOpacity(inc.status),
          color: severityColor(inc.severity, theme),
        },
      };
      return feature;
    }),
  };
}

// Build GeoJSON for satellite detection markers
function buildSatelliteGeoJSON(incidents: Incident[]): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = [];
  for (const inc of incidents) {
    const satelliteEvents = inc.timeline.filter(
      (e) => e.sourceType === "satellite"
    );
    for (const evt of satelliteEvents) {
      features.push({
        type: "Feature",
        properties: {
          incidentId: inc.id,
          sourceName: evt.sourceName,
          confidence: evt.confidence,
          timestamp: evt.timestamp,
          title: evt.title,
        },
        geometry: {
          type: "Point",
          coordinates: [
            inc.longitude + (Math.random() - 0.5) * 0.02,
            inc.latitude + (Math.random() - 0.5) * 0.02,
          ],
        },
      });
    }
  }
  return { type: "FeatureCollection", features };
}

// Build GeoJSON for community report markers
function buildCommunityGeoJSON(incidents: Incident[]): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = [];
  for (const inc of incidents) {
    const communityEvents = inc.timeline.filter(
      (e) => e.sourceType === "community"
    );
    for (const evt of communityEvents) {
      features.push({
        type: "Feature",
        properties: {
          incidentId: inc.id,
          sourceName: evt.sourceName,
          confidence: evt.confidence,
          verification: evt.verification,
          timestamp: evt.timestamp,
          title: evt.title,
        },
        geometry: {
          type: "Point",
          coordinates: [
            inc.longitude + (Math.random() - 0.5) * 0.04,
            inc.latitude + (Math.random() - 0.5) * 0.04,
          ],
        },
      });
    }
  }
  return { type: "FeatureCollection", features };
}

// Build GeoJSON for evacuation zones (buffer around evac-ordered incidents)
function buildEvacuationGeoJSON(incidents: Incident[]): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = [];
  for (const inc of incidents) {
    if (!inc.evacuationOrder) continue;
    const radiusKm = Math.max(2, Math.sqrt(inc.estimatedAreaHa) / 6);
    const feature = circlePolygon(inc.latitude, inc.longitude, radiusKm, 64);
    feature.properties = {
      incidentId: inc.id,
      displayName: inc.displayName,
    };
    features.push(feature);
  }
  return { type: "FeatureCollection", features };
}

// Build GeoJSON for the selected incident halo
function buildSelectedGeoJSON(
  selected: Incident | null
): GeoJSON.FeatureCollection {
  if (!selected) return { type: "FeatureCollection", features: [] };
  const radiusKm = Math.max(0.8, Math.sqrt(selected.estimatedAreaHa) / 10) + 1.5;
  const feature = circlePolygon(
    selected.latitude,
    selected.longitude,
    radiusKm,
    64
  );
  feature.properties = { id: selected.id };
  return { type: "FeatureCollection", features: [feature] };
}

// ============================================================
// Map component — single MapLibre instance, multi-source updates
// ============================================================

export interface EmberMapHandle {
  flyTo: (lat: number, lon: number, zoom?: number) => void;
  fitBounds: (bounds: [[number, number], [number, number]]) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  resetView: () => void;
  getZoom: () => number;
}

export type BasemapMode = "dark" | "light" | "satellite";

export interface FireRiskFeature {
  type: "Feature";
  geometry: { type: "Point"; coordinates: [number, number] };
  properties: { rcm: number; dico: string };
}

export interface FireStationFeature {
  type: "Feature";
  geometry: { type: "Point"; coordinates: [number, number] };
  properties: { name?: string; id: number };
}

export interface EmberMapProps {
  incidents: Incident[];
  selectedIncidentId: string | null;
  theme: "dark" | "light";
  basemap: BasemapMode;
  visibleSources: Set<SourceType>;
  onSelectIncident: (id: string | null) => void;
  // Explicit "fly to this incident" trigger — only set when the user
  // clicks a "locate" button or double-clicks a list item. NOT fired
  // on every selection change (that would lock the map).
  flyToIncidentId?: string | null;
  onFlyToCleared?: () => void;
  /** Optional: long-press (or right-click) on a marker fires this with screen coords + incident id */
  onMarkerLongPress?: (x: number, y: number, incidentId: string) => void;
  fireRiskFeatures?: FireRiskFeature[];
  fireStationsFeatures?: FireStationFeature[];
  satelliteFeatures?: any[];
  showFireRisk?: boolean;
  showFireStations?: boolean;
  showSatellite?: boolean;
  className?: string;
}

function pickStyle(basemap: BasemapMode, theme: "dark" | "light"): string {
  if (basemap === "sat") return DARK_STYLE;
  // Satellite mode uses the dark style as a base; the EOX raster is added
  // as a layer on top (see EFFECT 2b), not as a style replacement.
  if (basemap === "satellite") return DARK_STYLE;
  if (basemap === "light" || (basemap === "dark" && theme === "light")) return LIGHT_STYLE;
  return DARK_STYLE;
}

// Ocean/water color per theme + basemap.
// — Dark mode: deep blue (#0a2540) — readable, distinguishes from land.
// — Light mode: classic blue (#a8c8e8) — similar to Google Maps water.
// — Satellite mode: keep the basemap's own water tint so the satellite
//   imagery looks natural.
function pickWaterColor(theme: "dark" | "light", basemap: BasemapMode): string {
  if (basemap === "satellite" || basemap === "sat") {
    // Satellite keeps the original water tint from the raster imagery
    return theme === "light" ? "#bcd4e6" : "#1e3a5f";
  }
  if (theme === "light") {
    // Light mode: classic soft blue water
    return "#a8c8e8";
  }
  // Dark mode: deep blue water (matches the warm parchment dark theme)
  return "#0a2540";
}

const EmberMap = forwardRef<EmberMapHandle, EmberMapProps>(function EmberMap({
  incidents,
  selectedIncidentId,
  theme: themeProp,
  basemap,
  visibleSources,
  onSelectIncident,
  flyToIncidentId,
  onFlyToCleared,
  fireRiskFeatures = [],
  fireStationsFeatures = [],
  satelliteFeatures = [],
  showFireRisk = false,
  showFireStations = false,
  showSatellite = false,
  onMarkerLongPress,
  className,
}, ref) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const initializedRef = useRef(false);
  const currentStyleRef = useRef<string>(""); // Track which CARTO style is loaded
  const [mapReady, setMapReady] = useState(false);

  // Defensive: theme may transiently be undefined during fast refresh / SSR
  const theme: "dark" | "light" = themeProp === "light" ? "light" : "dark";

  // Expose imperative handle for parent to control zoom, reset, etc.
  useImperativeHandle(ref, () => ({
    flyTo: (lat: number, lon: number, zoom?: number) => {
      mapRef.current?.flyTo({
        center: [lon, lat],
        zoom: zoom ?? mapRef.current?.getZoom() ?? 10,
        duration: 1200,
        essential: true,
      });
    },
    fitBounds: (bounds: [[number, number], [number, number]]) => {
      mapRef.current?.fitBounds(bounds, { padding: 60, duration: 1200 });
    },
    zoomIn: () => mapRef.current?.zoomIn(),
    zoomOut: () => mapRef.current?.zoomOut(),
    resetView: () => {
      mapRef.current?.flyTo({
        center: [-8.0, 39.5],
        zoom: 6.2,
        duration: 1200,
        essential: true,
      });
    },
    getZoom: () => mapRef.current?.getZoom() ?? 0,
  }), []);

  // ---------------------------------------------------------
  // EFFECT 1 — Initialize the map (runs once)
  // Creates the MapLibre instance, adds all sources + layers
  // Never re-runs; cleanup only on unmount
  // ---------------------------------------------------------
  useEffect(() => {
    if (!containerRef.current || initializedRef.current) return;
    initializedRef.current = true;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: pickStyle(basemap, theme),
      center: [-8.0, 39.5], // Center on mainland Portugal
      zoom: 6.2,
      attributionControl: true,
      maxZoom: 16,
      minZoom: 4,
      dragRotate: false,
      pitchWithRotate: false,
      touchZoomRotate: true,
      touchPitch: false,
      cooperativeGestures: false,
    });

    mapRef.current = map;

    map.on("load", () => {
      addEmberSourcesAndLayers(map, theme, basemap);
      currentStyleRef.current = pickStyle(basemap, theme);
      setMapReady(true);
      // Broadcast map readiness to the LayerPanel system (lazy-loaded
      // advanced overlays: biomass, risk, aerial). Listens via window.
      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("lumes:map-ready", { detail: { map } })
        );
      }
    });

    return () => {
      map.remove();
      mapRef.current = null;
      initializedRef.current = false;
      setMapReady(false);
    };
  }, []);

  // ---------------------------------------------------------
  // EFFECT 2 — Switch style ONLY when the actual CARTO style URL changes
  // (dark ↔ light). Satellite mode uses dark as its base, so switching
  // to/from satellite does NOT trigger a style swap.
  // ---------------------------------------------------------
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!initializedRef.current || !mapReady) return;

    const targetStyle = pickStyle(basemap, theme);

    // Skip if the CARTO style hasn't actually changed
    if (currentStyleRef.current === targetStyle) return;

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMapReady(false);

    const onStyleLoad = () => {
      addEmberSourcesAndLayers(map, theme, basemap);
      // Customize ocean/water color per theme and basemap
      try {
        const style = map.getStyle();
        const layers = style.layers || [];
        // Find water/ocean layers and re-tint them
        const waterColor = pickWaterColor(theme, basemap);
        for (const layer of layers) {
          if (layer.id && /water|ocean|sea/i.test(layer.id)) {
            if (layer.type === "fill") {
              map.setPaintProperty(layer.id, "fill-color", waterColor);
            } else if (layer.type === "background" && /water|ocean/i.test(layer.id)) {
              map.setPaintProperty(layer.id, "background-color", waterColor);
            }
          }
        }
      } catch {
        // ignore
      }
      currentStyleRef.current = targetStyle;
      setMapReady(true);
    };

    map.once("style.load", onStyleLoad);
    map.setStyle(targetStyle);

    return () => {
      map.off("style.load", onStyleLoad);
    };
  }, [theme, basemap]);

  // ---------------------------------------------------------
  // EFFECT 2b — Satellite raster overlay
  // Adds/removes the EOX Sentinel-2 raster layer on top of the base style.
  // Does NOT require mapReady — uses a direct check on the map instance.
  // ---------------------------------------------------------
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // Wait for the map to be loaded enough to add layers
    const applySatellite = () => {
      // Add the satellite raster source if not present
      if (!map.getSource(SATELLITE_SOURCE_ID)) {
        map.addSource(SATELLITE_SOURCE_ID, {
          type: "raster",
          tiles: [SATELLITE_TILES],
          tileSize: 256,
          attribution: 'Sentinel-2 cloudless © EOX IT Services GmbH',
          maxzoom: 14,
        });
      }

      // Add the satellite raster layer — insert it AFTER the background
      // layer but before the labels/roads. Find the background layer and
      // insert right after it. If no background layer, insert at bottom.
      if (!map.getLayer(SATELLITE_LAYER_ID)) {
        const layers = map.getStyle().layers || [];
        // Find the first non-background layer (background is usually first)
        const insertBeforeId = layers.find(l => l.type !== "background")?.id;
        if (insertBeforeId) {
          map.addLayer({
            id: SATELLITE_LAYER_ID,
            type: "raster",
            source: SATELLITE_SOURCE_ID,
            paint: { "raster-opacity": 1 },
          }, insertBeforeId);
        } else {
          map.addLayer({
            id: SATELLITE_LAYER_ID,
            type: "raster",
            source: SATELLITE_SOURCE_ID,
            paint: { "raster-opacity": 1 },
          });
        }
      }

      // When satellite is active, hide the CARTO background layer so the
      // raster shows through. When inactive, restore it.
      const bgVisibility = basemap === "satellite" ? "none" : "visible";
      const satVisibility = basemap === "satellite" ? "visible" : "none";

      // CARTO styles name their background layer "background" or similar
      const allLayers = map.getStyle().layers || [];
      for (const layer of allLayers) {
        if (layer.type === "background") {
          map.setLayoutProperty(layer.id, "visibility", bgVisibility);
        }
      }

      if (map.getLayer(SATELLITE_LAYER_ID)) {
        map.setLayoutProperty(SATELLITE_LAYER_ID, "visibility", satVisibility);
      }
    };

    // If map is loaded, apply immediately. Otherwise wait for load.
    if (map.isStyleLoaded()) {
      applySatellite();
    } else {
      map.once("style.load", applySatellite);
    }
  }, [basemap, mapReady]);

  // ---------------------------------------------------------
  // EFFECT 3 — Update incidents source via setData()
  // ---------------------------------------------------------
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    if (!map.getSource(SOURCE_IDS.incidents)) return;

    const geojson = buildIncidentsGeoJSON(incidents, theme);
    (map.getSource(SOURCE_IDS.incidents) as maplibregl.GeoJSONSource).setData(
      geojson
    );
  }, [incidents, theme, mapReady]);

  // ---------------------------------------------------------
  // EFFECT 4 — Update satellite source
  // ---------------------------------------------------------
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    if (!map.getSource(SOURCE_IDS.satellite)) return;

    if (!visibleSources.has("satellite")) {
      (map.getSource(SOURCE_IDS.satellite) as maplibregl.GeoJSONSource).setData({
        type: "FeatureCollection",
        features: [],
      });
      return;
    }

    const geojson = buildSatelliteGeoJSON(incidents);
    (map.getSource(SOURCE_IDS.satellite) as maplibregl.GeoJSONSource).setData(
      geojson
    );
  }, [incidents, visibleSources, mapReady]);

  // ---------------------------------------------------------
  // EFFECT 5 — Update community source
  // ---------------------------------------------------------
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    if (!map.getSource(SOURCE_IDS.community)) return;

    if (!visibleSources.has("community")) {
      (map.getSource(SOURCE_IDS.community) as maplibregl.GeoJSONSource).setData({
        type: "FeatureCollection",
        features: [],
      });
      return;
    }

    const geojson = buildCommunityGeoJSON(incidents);
    (map.getSource(SOURCE_IDS.community) as maplibregl.GeoJSONSource).setData(
      geojson
    );
  }, [incidents, visibleSources, mapReady]);

  // ---------------------------------------------------------
  // EFFECT 6 — Update evacuation source
  // ---------------------------------------------------------
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    if (!map.getSource(SOURCE_IDS.evacuation)) return;

    const geojson = buildEvacuationGeoJSON(incidents);
    (map.getSource(SOURCE_IDS.evacuation) as maplibregl.GeoJSONSource).setData(
      geojson
    );
  }, [incidents, mapReady]);

  // ---------------------------------------------------------
  // EFFECT 7 — Update selected incident halo
  // ---------------------------------------------------------
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    if (!map.getSource(SOURCE_IDS.selected)) return;

    const selected = selectedIncidentId
      ? incidents.find((i) => i.id === selectedIncidentId) ?? null
      : null;
    const geojson = buildSelectedGeoJSON(selected);
    (map.getSource(SOURCE_IDS.selected) as maplibregl.GeoJSONSource).setData(
      geojson
    );
  }, [selectedIncidentId, incidents, mapReady]);

  // ---------------------------------------------------------
  // EFFECT 8 — Layer visibility based on visibleSources
  // ---------------------------------------------------------
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    if (!map.getLayer(LAYER_IDS.satelliteDots)) return;

    const satVisible = visibleSources.has("satellite") ? "visible" : "none";
    const commVisible = visibleSources.has("community") ? "visible" : "none";
    map.setLayoutProperty(LAYER_IDS.satelliteDots, "visibility", satVisible);
    map.setLayoutProperty(LAYER_IDS.communityDots, "visibility", commVisible);
  }, [visibleSources, mapReady]);

  // ---------------------------------------------------------
  // EFFECT 8b — Fire risk layer (IPMA municipalities)
  // ---------------------------------------------------------
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    if (!map.getSource(SOURCE_IDS.fireRisk)) return;

    const geojson: GeoJSON.FeatureCollection = {
      type: "FeatureCollection",
      features: fireRiskFeatures,
    };
    (map.getSource(SOURCE_IDS.fireRisk) as maplibregl.GeoJSONSource).setData(geojson);

    if (map.getLayer(LAYER_IDS.fireRiskCircles)) {
      map.setLayoutProperty(
        LAYER_IDS.fireRiskCircles,
        "visibility",
        showFireRisk ? "visible" : "none"
      );
    }
    if (map.getLayer(LAYER_IDS.fireRiskLabels)) {
      map.setLayoutProperty(
        LAYER_IDS.fireRiskLabels,
        "visibility",
        showFireRisk ? "visible" : "none"
      );
    }
  }, [fireRiskFeatures, showFireRisk, mapReady]);

  // ---------------------------------------------------------
  // EFFECT 8c — Fire stations layer (OSM)
  // ---------------------------------------------------------
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    if (!map.getSource(SOURCE_IDS.fireStations)) return;

    const geojson: GeoJSON.FeatureCollection = {
      type: "FeatureCollection",
      features: fireStationsFeatures,
    };
    (map.getSource(SOURCE_IDS.fireStations) as maplibregl.GeoJSONSource).setData(geojson);

    if (map.getLayer(LAYER_IDS.fireStationsDots)) {
      map.setLayoutProperty(
        LAYER_IDS.fireStationsDots,
        "visibility",
        showFireStations ? "visible" : "none"
      );
    }
    if (map.getLayer(LAYER_IDS.fireStationsDots + "-fallback")) {
      map.setLayoutProperty(
        LAYER_IDS.fireStationsDots + "-fallback",
        "visibility",
        showFireStations ? "visible" : "none"
      );
    }
    if (map.getLayer(LAYER_IDS.fireStationsLabels)) {
      map.setLayoutProperty(
        LAYER_IDS.fireStationsLabels,
        "visibility",
        showFireStations ? "visible" : "none"
      );
    }
  }, [fireStationsFeatures, showFireStations, mapReady]);

  // ---------------------------------------------------------
  // EFFECT 8d — Satellite detections layer (NASA FIRMS VIIRS)
  // ---------------------------------------------------------
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    if (!map.getSource(SOURCE_IDS.satellite)) return;

    const geojson: GeoJSON.FeatureCollection = {
      type: "FeatureCollection",
      features: satelliteFeatures,
    };
    (map.getSource(SOURCE_IDS.satellite) as maplibregl.GeoJSONSource).setData(geojson);

    if (map.getLayer(LAYER_IDS.satelliteDots)) {
      map.setLayoutProperty(
        LAYER_IDS.satelliteDots,
        "visibility",
        showSatellite ? "visible" : "none"
      );
    }
  }, [satelliteFeatures, showSatellite, mapReady]);

  // ---------------------------------------------------------
  // EFFECT 9 — Click/tap + hover popup handlers (touch-aware)
  // ---------------------------------------------------------
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    // Detect touch device — disable hover popups on touch
    const isTouchDevice = "ontouchstart" in window || navigator.maxTouchPoints > 0;

    // Create a single popup instance reused for hover/tap
    const popup = new maplibregl.Popup({
      closeButton: false,
      closeOnClick: false,
      maxWidth: "280px",
      offset: 12,
    });

    let popupHoverTimer: ReturnType<typeof setTimeout> | null = null;

    // Helper: build popup HTML from feature properties
    const buildPopupHtml = (props: any) => {
      const name = props?.displayName || "Incident";
      const severity = props?.severity || "—";
      const status = props?.status || "—";
      const areaHa = props?.areaHa || 0;
      const sourceCount = props?.sourceCount || 1;

      const sevColor =
        severity === "critical" ? "#ff4438"
        : severity === "high" ? "#ff8844"
        : severity === "medium" ? "#44aadd"
        : "#44dd88";

      return `
        <div style="background:var(--ember-surface);border:1px solid var(--ember-border);border-radius:8px;padding:10px 12px;font-family:var(--font-geist-sans),sans-serif;box-shadow:0 8px 24px rgba(0,0,0,0.5);position:relative;">
          <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;">
            <span style="width:8px;height:8px;border-radius:50%;background:${sevColor};flex-shrink:0;${severity === "critical" ? "box-shadow:0 0 0 3px rgba(255,68,56,0.3);" : ""}"></span>
            <span style="font-size:12px;font-weight:600;color:var(--ember-text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:200px;">${name}</span>
          </div>
          <div style="display:flex;gap:8px;font-size:10px;color:var(--ember-text-muted);text-transform:uppercase;letter-spacing:0.05em;">
            <span style="color:${sevColor};font-weight:600;">${severity}</span>
            <span style="color:var(--ember-text-faint);">·</span>
            <span>${status}</span>
            ${areaHa > 0 ? `<span style="color:var(--ember-text-faint);">·</span><span>${areaHa} ha</span>` : ""}
            <span style="color:var(--ember-text-faint);">·</span>
            <span>${sourceCount} source${sourceCount !== 1 ? "s" : ""}</span>
          </div>
          <div style="position:absolute;bottom:-6px;left:50%;transform:translateX(-50%) rotate(45deg);width:10px;height:10px;background:var(--ember-surface);border-right:1px solid var(--ember-border);border-bottom:1px solid var(--ember-border);"></div>
        </div>
      `;
    };

    // Helper: query features at point with generous 40px tolerance.
    //
    // The fire icons are rendered as 24-32px clusters/circles — too small for
    // a comfortable click target. We probe three concentric rings:
    //   1. Direct pixel hit (1px)
    //   2. Rendered hit area (40×40 box around point)
    //   3. Nearest source feature within 40px radius (final fallback)
    //
    // The nearest-source probe queries `ember-incidents` directly, which
    // includes both rendered clusters AND unclustered points — so even when
    // the click falls in a "gap" between rendered features we still hit.
    const TOLERANCE_PX = 40;
    const queryIncidentFeatures = (point: { x: number; y: number }) => {
      // 1. Direct hit on incident fill / stroke layers
      let features = map.queryRenderedFeatures(point, {
        layers: [LAYER_IDS.incidentFill, LAYER_IDS.incidentStroke],
      });
      if (features.length > 0) return features;

      // 2. Wider rendered box
      const wide = map.queryRenderedFeatures([
        [point.x - TOLERANCE_PX, point.y - TOLERANCE_PX],
        [point.x + TOLERANCE_PX, point.y + TOLERANCE_PX],
      ], { layers: [LAYER_IDS.incidentFill, LAYER_IDS.incidentStroke] });
      if (wide.length > 0) return wide;

      // 3. Nearest source feature within tolerance (final fallback).
      //    This handles cases where clustering hides individual incident
      //    markers at low zoom — the click still selects the nearest incident.
      try {
        const sourceFeatures = map.querySourceFeatures(SOURCE_IDS.incidents);
        if (sourceFeatures && sourceFeatures.length > 0) {
          let nearest: { feature: any; dist: number } | null = null;
          for (const f of sourceFeatures) {
            const g: any = f.geometry;
            if (g?.type !== "Point" || !g.coordinates) continue;
            const p = map.project(g.coordinates);
            const dx = p.x - point.x;
            const dy = p.y - point.y;
            const d = Math.sqrt(dx * dx + dy * dy);
            if (d <= TOLERANCE_PX && (!nearest || d < nearest.dist)) {
              nearest = { feature: f, dist: d };
            }
          }
          if (nearest) return [nearest.feature];
        }
      } catch {
        // querySourceFeatures throws if source not loaded yet — ignore
      }
      return [];
    };

    const onClick = (e: maplibregl.MapMouseEvent) => {
      // Check if clicking a cluster — if so, zoom in toward it
      const clusterFeatures = map.queryRenderedFeatures(e.point, {
        layers: [LAYER_IDS.incidentFill + "-clusters"],
      });
      if (clusterFeatures.length > 0) {
        // Simple, reliable approach: zoom in +2 levels toward the cluster center
        const currentZoom = map.getZoom();
        const targetZoom = Math.min(currentZoom + 2, 14);
        map.flyTo({
          center: [e.lngLat.lng, e.lngLat.lat],
          zoom: targetZoom,
          duration: 500,
          essential: true,
        });
        return;
      }

      // Check for incident features
      const features = queryIncidentFeatures(e.point);
      if (features.length > 0) {
        const id = features[0].properties?.id as string | undefined;
        if (id) {
          onSelectIncident(id);
          // On touch devices, also show popup on tap (since there's no hover)
          if (isTouchDevice) {
            popup.setLngLat(e.lngLat).setHTML(buildPopupHtml(features[0].properties)).addTo(map);
            // Auto-dismiss after 3 seconds on touch
            setTimeout(() => popup.remove(), 3000);
          }
        }
      } else {
        // Click on empty area — clear selection + dismiss popup
        const hit = map.queryRenderedFeatures(e.point);
        if (hit.length === 0) {
          onSelectIncident(null);
          popup.remove();
        }
      }
    };

    // Hover handlers — only on non-touch devices
    const onMouseMove = (e: maplibregl.MapMouseEvent) => {
      if (isTouchDevice) return;

      const features = queryIncidentFeatures(e.point);

      if (features.length > 0) {
        map.getCanvas().style.cursor = "pointer";
        if (popupHoverTimer) clearTimeout(popupHoverTimer);
        popupHoverTimer = setTimeout(() => {
          popup.setLngLat(e.lngLat).setHTML(buildPopupHtml(features[0].properties)).addTo(map);
        }, 200);
      } else {
        map.getCanvas().style.cursor = "";
        if (popupHoverTimer) {
          clearTimeout(popupHoverTimer);
          popupHoverTimer = null;
        }
        popup.remove();
      }
    };

    const onMouseLeave = () => {
      if (isTouchDevice) return;
      if (popupHoverTimer) {
        clearTimeout(popupHoverTimer);
        popupHoverTimer = null;
      }
      popup.remove();
      map.getCanvas().style.cursor = "";
    };

    // Long-press / right-click handler for marker context menu
    const onLongPressTrigger = (x: number, y: number) => {
      const features = queryIncidentFeatures({ x, y } as maplibregl.Point);
      if (features.length > 0) {
        const id = features[0].properties?.id as string | undefined;
        if (id && onMarkerLongPress) {
          onMarkerLongPress(x, y, id);
        }
      }
    };

    // Desktop: right-click on a marker
    const onContextMenu = (e: maplibregl.MapMouseEvent) => {
      e.preventDefault?.();
      onLongPressTrigger(e.point.x, e.point.y);
    };

    // Mobile: 500ms touch-and-hold timer
    let touchTimer: ReturnType<typeof setTimeout> | null = null;
    let touchStart = { x: 0, y: 0 };
    let touchMoved = false;
    const onTouchStart = (e: maplibregl.MapMouseEvent) => {
      touchStart = { x: e.point.x, y: e.point.y };
      touchMoved = false;
      if (touchTimer) clearTimeout(touchTimer);
      touchTimer = setTimeout(() => {
        if (!touchMoved) onLongPressTrigger(touchStart.x, touchStart.y);
      }, 600);
    };
    const onTouchMove = (e: maplibregl.MapMouseEvent) => {
      const dx = Math.abs(e.point.x - touchStart.x);
      const dy = Math.abs(e.point.y - touchStart.y);
      if (dx > 10 || dy > 10) {
        touchMoved = true;
        if (touchTimer) { clearTimeout(touchTimer); touchTimer = null; }
      }
    };
    const onTouchEnd = () => {
      if (touchTimer) { clearTimeout(touchTimer); touchTimer = null; }
    };

    map.on("click", onClick);
    map.on("contextmenu", onContextMenu);
    if (isTouchDevice) {
      map.on("touchstart", onTouchStart as any);
      map.on("touchmove", onTouchMove as any);
      map.on("touchend", onTouchEnd as any);
      map.on("touchcancel", onTouchEnd as any);
    }
    if (!isTouchDevice) {
      map.on("mousemove", onMouseMove);
      map.on("mouseout", onMouseLeave);
    }

    return () => {
      map.off("click", onClick);
      map.off("contextmenu", onContextMenu);
      if (isTouchDevice) {
        map.off("touchstart", onTouchStart as any);
        map.off("touchmove", onTouchMove as any);
        map.off("touchend", onTouchEnd as any);
        map.off("touchcancel", onTouchEnd as any);
      }
      if (!isTouchDevice) {
        map.off("mousemove", onMouseMove);
        map.off("mouseout", onMouseLeave);
      }
      popup.remove();
      if (popupHoverTimer) clearTimeout(popupHoverTimer);
      if (touchTimer) clearTimeout(touchTimer);
    };
  }, [onSelectIncident, mapReady, onMarkerLongPress]);

  // ---------------------------------------------------------
  // EFFECT 10 — Fly to incident ONLY when explicitly requested
  // (via flyToIncidentId prop, not on every selection change)
  // ---------------------------------------------------------
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !flyToIncidentId || !mapReady) return;
    const inc = incidents.find((i) => i.id === flyToIncidentId);
    if (!inc) return;
    map.flyTo({
      center: [inc.longitude, inc.latitude],
      zoom: Math.max(map.getZoom(), 10),
      duration: 1200,
      essential: true,
    });
    // Clear the fly-to request after executing it
    if (onFlyToCleared) onFlyToCleared();
  }, [flyToIncidentId, incidents, mapReady, onFlyToCleared]);

  return (
    <div
      ref={containerRef}
      className={`ember-map-container ${className ?? ""}`}
      style={{
        background: "var(--ember-map-bg)",
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        width: "100%",
        height: "100%",
      }}
    />
  );
});

export default EmberMap;

// ============================================================
// Sources + Layers setup
// Called once on initial load, and again after each style swap
// ============================================================
function addEmberSourcesAndLayers(
  map: maplibregl.Map,
  theme: "dark" | "light",
  basemap: BasemapMode
) {
  // On satellite basemap, overlays need higher opacity + thicker strokes
  // to be visible against bright terrain imagery
  const isSatellite = basemap === "satellite";
  const satDotRadius = isSatellite ? 7 : 5;
  const commDotRadius = isSatellite ? 6 : 4;
  const riskOpacity = isSatellite ? 0.75 : 0.55;

  // Remove existing layers/sources if present (post-style-swap cleanup)
  Object.values(LAYER_IDS).forEach((id) => {
    if (map.getLayer(id)) map.removeLayer(id);
    if (map.getLayer(id + "-fallback")) map.removeLayer(id + "-fallback");
    if (map.getLayer(id + "-clusters")) map.removeLayer(id + "-clusters");
    if (map.getLayer(id + "-cluster-count")) map.removeLayer(id + "-cluster-count");
  });
  Object.values(SOURCE_IDS).forEach((id) => {
    if (map.getSource(id)) map.removeSource(id);
  });

  // === Add fire icon images (one per severity) ===
  // High-quality flame icons drawn at 128x128 for crisp scaling at all zoom levels
  // Design: realistic flame with gradient, inner glow, drop shadow, white outline
  const severityColors: Record<string, { main: string; bright: string; dark: string; glow: string }> = {
    critical: {
      main: "#ff4438",
      bright: "#ffcc33",
      dark: "#aa0000",
      glow: "rgba(255,68,56,0.6)",
    },
    high: {
      main: "#ff8844",
      bright: "#ffdd66",
      dark: "#cc4400",
      glow: "rgba(255,136,68,0.5)",
    },
    medium: {
      main: "#44aadd",
      bright: "#88ddee",
      dark: "#2266aa",
      glow: "rgba(68,170,221,0.4)",
    },
    low: {
      main: "#44dd88",
      bright: "#88eeaa",
      dark: "#229944",
      glow: "rgba(68,221,136,0.4)",
    },
  };

  for (const [sev, colors] of Object.entries(severityColors)) {
    const iconId = `fire-icon-${sev}`;
    if (map.hasImage(iconId)) map.removeImage(iconId);

    // Draw at 128x128 (2x for retina-quality scaling)
    const S = 128;
    const canvas = document.createElement("canvas");
    canvas.width = S;
    canvas.height = S;
    const ctx = canvas.getContext("2d")!;

    // Drop shadow under the flame (ground effect)
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.4)";
    ctx.shadowBlur = 6;
    ctx.shadowOffsetY = 3;
    ctx.beginPath();
    ctx.ellipse(64, 112, 18, 5, 0, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(0,0,0,0.3)";
    ctx.fill();
    ctx.restore();

    // Outer glow (for critical and high severity)
    if (sev === "critical" || sev === "high") {
      ctx.save();
      ctx.shadowColor = colors.glow;
      ctx.shadowBlur = sev === "critical" ? 20 : 12;
      ctx.beginPath();
      ctx.moveTo(64, 10);
      ctx.bezierCurveTo(96, 30, 104, 60, 84, 96);
      ctx.bezierCurveTo(76, 112, 52, 112, 44, 96);
      ctx.bezierCurveTo(24, 60, 32, 30, 64, 10);
      ctx.closePath();
      ctx.fillStyle = colors.main;
      ctx.globalAlpha = 0.3;
      ctx.fill();
      ctx.restore();
    }

    // Main flame body — outer shape (tall, pointed top, rounded bottom)
    ctx.beginPath();
    ctx.moveTo(64, 8);                         // top tip
    ctx.bezierCurveTo(94, 28, 102, 56, 82, 94);  // right side
    ctx.bezierCurveTo(74, 110, 54, 110, 46, 94);  // bottom curve
    ctx.bezierCurveTo(26, 56, 34, 28, 64, 8);     // left side
    ctx.closePath();

    // Vertical gradient: bright yellow at bottom → main color → dark at top
    const grad = ctx.createLinearGradient(0, 8, 0, 110);
    grad.addColorStop(0, colors.main);
    grad.addColorStop(0.3, colors.main);
    grad.addColorStop(0.65, colors.bright);
    grad.addColorStop(0.85, colors.bright);
    grad.addColorStop(1, "#ffeb99");
    ctx.fillStyle = grad;
    ctx.fill();

    // White outline for visibility on any basemap
    ctx.strokeStyle = isSatellite ? "rgba(255,255,255,0.95)" : "rgba(255,255,255,0.5)";
    ctx.lineWidth = isSatellite ? 4 : 2.5;
    ctx.lineJoin = "round";
    ctx.stroke();

    // Inner flame (darker, gives depth)
    ctx.beginPath();
    ctx.moveTo(64, 34);
    ctx.bezierCurveTo(78, 48, 82, 68, 72, 90);
    ctx.bezierCurveTo(66, 100, 56, 98, 54, 90);
    ctx.bezierCurveTo(46, 70, 50, 50, 64, 34);
    ctx.closePath();
    const innerGrad = ctx.createLinearGradient(0, 34, 0, 98);
    innerGrad.addColorStop(0, colors.dark);
    innerGrad.addColorStop(0.5, colors.main);
    innerGrad.addColorStop(1, colors.bright);
    ctx.fillStyle = innerGrad;
    ctx.fill();

    // Core highlight (brightest point — the "heart" of the flame)
    ctx.beginPath();
    ctx.moveTo(64, 52);
    ctx.bezierCurveTo(70, 60, 72, 72, 66, 84);
    ctx.bezierCurveTo(62, 90, 58, 88, 58, 84);
    ctx.bezierCurveTo(54, 72, 58, 60, 64, 52);
    ctx.closePath();
    ctx.fillStyle = "rgba(255,255,220,0.7)";
    ctx.fill();

    // Add to map
    const imageData = ctx.getImageData(0, 0, S, S);
    map.addImage(iconId, { width: S, height: S, data: imageData.data });
  }

  // --- Source: incidents (as points for fire icons, with clustering) ---
  map.addSource(SOURCE_IDS.incidents, {
    type: "geojson",
    data: { type: "FeatureCollection", features: [] },
    cluster: true,
    clusterMaxZoom: 8,      // Cluster up to zoom 8, then show individual markers
    clusterRadius: 40,      // Radius of each cluster in pixels
    clusterProperties: {
      // Track max severity within each cluster for coloring
      maxSeverity: ["max", ["match", ["get", "severity"], "critical", 4, "high", 3, "medium", 2, "low", 1, 0]],
      incidentCount: ["+", ["case", ["==", ["get", "cluster"], true], 0, 1]],
    },
  });

  // Cluster layer — shows colored circles when multiple incidents overlap
  map.addLayer({
    id: LAYER_IDS.incidentFill + "-clusters",
    type: "circle",
    source: SOURCE_IDS.incidents,
    filter: ["==", ["get", "cluster"], true],
    paint: {
      "circle-radius": [
        "step", ["get", "point_count"],
        18,  // small clusters (2-4)
        5, 24,    // 5+ incidents
        10, 30,   // 10+ incidents
        20, 38,   // 20+ incidents
      ],
      "circle-color": [
        "match", ["get", "maxSeverity"],
        4, "#ff4438",  // critical — red
        3, "#ff8844",  // high — orange
        2, "#44aadd",  // medium — blue
        1, "#44dd88",  // low — green
        "#7f8c8d",
      ],
      "circle-opacity": 0.9,
      "circle-stroke-color": isSatellite ? "#ffffff" : (theme === "dark" ? "#0c1f1a" : "#ffffff"),
      "circle-stroke-width": isSatellite ? 3 : 2.5,
      "circle-stroke-opacity": 1,
      "circle-blur": 0.1,  // slight soft edge
    },
  });

  // Cluster count labels — bold, larger, with halo for readability
  map.addLayer({
    id: LAYER_IDS.incidentFill + "-cluster-count",
    type: "symbol",
    source: SOURCE_IDS.incidents,
    filter: ["==", ["get", "cluster"], true],
    layout: {
      "text-field": "{point_count}",
      "text-size": [
        "interpolate", ["linear"], ["get", "point_count"],
        2, 13,
        5, 15,
        10, 16,
        20, 18,
      ],
      "text-font": ["Open Sans Bold", "Arial Unicode MS Bold"],
    },
    paint: {
      "text-color": "#ffffff",
      "text-halo-color": isSatellite ? "rgba(0,0,0,0.7)" : "rgba(0,0,0,0.4)",
      "text-halo-width": 1.5,
    },
  });

  // Fire icon layer — shows NON-clustered features (individual markers)
  // Using "!= true" filter which correctly handles features without cluster property
  map.addLayer({
    id: LAYER_IDS.incidentFill,
    type: "symbol",
    source: SOURCE_IDS.incidents,
    filter: ["!", ["has", "cluster"]],
    layout: {
      "icon-image": [
        "match", ["get", "severity"],
        "critical", "fire-icon-critical",
        "high", "fire-icon-high",
        "medium", "fire-icon-medium",
        "low", "fire-icon-low",
        "fire-icon-medium",
      ],
      "icon-size": [
        "interpolate", ["linear"], ["zoom"],
        4, 0.30,   // country view
        6, 0.38,   // region view
        8, 0.45,   // cluster threshold — icons appear
        10, 0.55,  // city view
        12, 0.65,  // street view
        14, 0.78,  // detail view
        16, 0.90,  // close-up
      ],
      "icon-allow-overlap": true,
      "icon-ignore-placement": true,
      "icon-anchor": "bottom",  // tip of flame points to the location
      "icon-pitch-alignment": "viewport",  // icons stay upright
      "icon-rotation-alignment": "viewport",
    },
    paint: {
      "icon-opacity": [
        "case",
        ["==", ["get", "status"], "resolved"],
        isSatellite ? 0.35 : 0.25,
        ["==", ["get", "status"], "monitoring"],
        isSatellite ? 0.55 : 0.45,
        isSatellite ? 0.95 : 0.90,
      ],
    },
  });

  // Ground indicator — tiny dot at each incident point (non-clustered only)
  // Kept very small so the flame icon is the primary visual
  map.addLayer({
    id: LAYER_IDS.incidentStroke,
    type: "circle",
    source: SOURCE_IDS.incidents,
    filter: ["!", ["has", "cluster"]],
    paint: {
      "circle-radius": 2,
      "circle-color": ["get", "color"],
      "circle-opacity": isSatellite ? 0.6 : 0.4,
      "circle-stroke-color": theme === "dark" ? "#0c1f1a" : "#ffffff",
      "circle-stroke-width": 1,
      "circle-stroke-opacity": 0.5,
    },
  });

  // --- Source: satellite detections ---
  map.addSource(SOURCE_IDS.satellite, {
    type: "geojson",
    data: { type: "FeatureCollection", features: [] },
  });

  map.addLayer({
    id: LAYER_IDS.satelliteDots,
    type: "circle",
    source: SOURCE_IDS.satellite,
    paint: {
      "circle-radius": satDotRadius,
      "circle-color": SOURCE_COLORS[theme].satellite,
      "circle-opacity": 0.9,
      "circle-stroke-color": theme === "dark" ? "#0c1f1a" : "#ffffff",
      "circle-stroke-width": isSatellite ? 2 : 1,
      "circle-stroke-opacity": 0.8,
    },
  });

  // --- Source: community reports ---
  map.addSource(SOURCE_IDS.community, {
    type: "geojson",
    data: { type: "FeatureCollection", features: [] },
  });

  map.addLayer({
    id: LAYER_IDS.communityDots,
    type: "circle",
    source: SOURCE_IDS.community,
    paint: {
      "circle-radius": commDotRadius,
      "circle-color": SOURCE_COLORS[theme].community,
      "circle-opacity": 0.85,
      "circle-stroke-color": theme === "dark" ? "#0c1f1a" : "#ffffff",
      "circle-stroke-width": isSatellite ? 1.5 : 1,
      "circle-stroke-opacity": 0.8,
    },
  });

  // --- Source: evacuation zones ---
  map.addSource(SOURCE_IDS.evacuation, {
    type: "geojson",
    data: { type: "FeatureCollection", features: [] },
  });

  map.addLayer({
    id: LAYER_IDS.evacuationFill,
    type: "fill",
    source: SOURCE_IDS.evacuation,
    paint: {
      "fill-color": SOURCE_COLORS[theme].evacuation,
      "fill-opacity": 0.18,
    },
  });

  map.addLayer({
    id: LAYER_IDS.evacuationStroke,
    type: "line",
    source: SOURCE_IDS.evacuation,
    paint: {
      "line-color": SOURCE_COLORS[theme].evacuation,
      "line-width": 1.5,
      "line-dasharray": [3, 2],
      "line-opacity": 0.7,
    },
  });

  // --- Source: selected incident halo (drawn on top) ---
  map.addSource(SOURCE_IDS.selected, {
    type: "geojson",
    data: { type: "FeatureCollection", features: [] },
  });

  map.addLayer({
    id: LAYER_IDS.selectedHalo,
    type: "line",
    source: SOURCE_IDS.selected,
    paint: {
      "line-color": "#ffffff",
      "line-width": 2,
      "line-opacity": 0.8,
      "line-dasharray": [4, 3],
    },
  });

  // --- Source: fire risk (IPMA) — municipality points colored by RCM ---
  map.addSource(SOURCE_IDS.fireRisk, {
    type: "geojson",
    data: { type: "FeatureCollection", features: [] },
  });

  map.addLayer({
    id: LAYER_IDS.fireRiskCircles,
    type: "circle",
    source: SOURCE_IDS.fireRisk,
    layout: { visibility: "none" },
    paint: {
      "circle-radius": [
        "interpolate", ["linear"], ["zoom"],
        5, 4,
        8, 8,
        11, 16,
      ],
      "circle-color": [
        "match", ["get", "rcm"],
        1, "#229954",  // Reduced — green
        2, "#f4d03f",  // Moderate — yellow
        3, "#f39c12",  // High — orange
        4, "#e74c3c",  // Very High — red
        5, "#922b21",  // Maximum — dark red
        "#7f8c8d",     // fallback
      ],
      "circle-opacity": riskOpacity,
      "circle-stroke-color": theme === "dark" ? "#0c1f1a" : "#ffffff",
      "circle-stroke-width": isSatellite ? 1.5 : 0.5,
      "circle-stroke-opacity": 0.7,
    },
  });

  // --- Source: fire stations (OSM) ---
  map.addSource(SOURCE_IDS.fireStations, {
    type: "geojson",
    data: { type: "FeatureCollection", features: [] },
  });

  map.addLayer({
    id: LAYER_IDS.fireStationsDots,
    type: "symbol",
    source: SOURCE_IDS.fireStations,
    layout: {
      visibility: "none",
      "icon-image": "fire-station-marker",
      "icon-size": 1,
      "icon-allow-overlap": true,
    },
  });

  // Fallback: if no icon image, use a circle. We add it as a separate layer
  // because MapLibre symbol layers without icon-image will silently not render.
  map.addLayer({
    id: LAYER_IDS.fireStationsDots + "-fallback",
    type: "circle",
    source: SOURCE_IDS.fireStations,
    layout: { visibility: "none" },
    paint: {
      "circle-radius": isSatellite ? 7 : 5,
      "circle-color": theme === "dark" ? "#3ddb95" : "#2a7a65",
      "circle-opacity": 0.95,
      "circle-stroke-color": theme === "dark" ? "#0c1f1a" : "#ffffff",
      "circle-stroke-width": isSatellite ? 2 : 1.2,
      "circle-stroke-opacity": 0.9,
    },
  });
}
