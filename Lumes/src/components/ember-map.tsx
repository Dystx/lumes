"use client";

import maplibregl, { type MapTouchEvent } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef, useState, forwardRef, useImperativeHandle } from "react";
import { mapMotionOptions } from "@/lib/map-motion";
import { escapePopupText, safePopupNumber } from "@/lib/map-popup";
import {
  buildIncidentFocusCamera,
  buildPortugalOverviewCamera,
  captureCameraSnapshot,
  isValidIncidentCenter,
  type CameraSnapshot,
  type IncidentFocusTarget,
  type MapPadding,
} from "@/lib/map/incident-focus-controller";
import {
  dispatchMapEvent,
  MAP_READY_EVENT,
  MAP_STYLE_RESTORED_EVENT,
  MAP_STYLE_TRANSITION_EVENT,
} from "@/lib/map/map-events";
import {
  createStyleTransitionController,
  createStyleTransitionRuntime,
  isStyleLoadError,
  shouldSkipStyleTransition,
  STYLE_LOAD_TIMEOUT_MS,
  type StyleTransitionMap,
} from "@/lib/map/style-transition";
import type {
  Incident,
  SourceType,
} from "@/lib/sample-data";
import {
  buildCommunityGeoJSON,
  buildEvacuationGeoJSON,
  buildIncidentsGeoJSON,
  buildSatelliteGeoJSON,
  buildSelectedGeoJSON,
} from "@/lib/map/geojson-builders";
import { setGeoJSONSourceData } from "@/lib/map/map-source";
import type { FireRiskFeature, FireStationFeature, SatelliteFeature } from "@/components/map/map-data-adapter";
export type { FireRiskFeature, FireStationFeature } from "@/components/map/map-data-adapter";
import {
  DARK_STYLE,
  LIGHT_STYLE,
  SATELLITE_LAYER_ID,
  SATELLITE_SOURCE_ID,
  SATELLITE_TILES,
  SOURCE_COLORS,
  pickStyle,
  pickWaterColor,
  type BasemapMode,
} from "@/lib/map/map-style";
export type { BasemapMode } from "@/lib/map/map-style";

type IncidentPopupProperties = Record<string, unknown>;

// ============================================================
// Source IDs — each is an independent GeoJSON source on the map
// ============================================================
export const SOURCE_IDS = {
  incidents: "ember-incidents",
  satellite: "ember-satellite",          // timeline-based satellite events (mostly samples)
  firmsSatellite: "ember-firms-satellite", // raw NASA FIRMS detections
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
  incidentCriticalCue: "ember-incidents-critical-cue",
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
// Map component — single MapLibre instance, multi-source updates
// ============================================================

export interface EmberMapHandle {
  flyTo: (lat: number, lon: number, zoom?: number) => void;
  fitBounds: (bounds: [[number, number], [number, number]]) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  resetView: () => void;
  enterIncidentFocus: (target: IncidentFocusTarget) => CameraSnapshot | null;
  exitIncidentFocus: (snapshot: CameraSnapshot | null) => void;
  returnToPortugalOverview: () => void;
  getCameraSnapshot: () => CameraSnapshot | null;
  isMapReady: () => boolean;
  getZoom: () => number;
  resize: () => void;
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
  satelliteFeatures?: SatelliteFeature[];
  showFireRisk?: boolean;
  showFireStations?: boolean;
  showSatellite?: boolean;
  className?: string;
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
   const mapLoadedRef = useRef(false);
   const currentStyleRef = useRef<string>(""); // Track which CARTO style is loaded
   const committedThemeRef = useRef<"dark" | "light">("dark");
   const committedBasemapRef = useRef<BasemapMode>("dark");
   const styleTransitionRef = useRef(createStyleTransitionController());
   const [mapLoaded, setMapLoaded] = useState(false);
   const [mapReady, setMapReady] = useState(false);
   const [incidentDataReady, setIncidentDataReady] = useState(false);
   const [mapStyleState, setMapStyleState] = useState<"initializing" | "ready" | "recovered" | "transitioning" | "retryable-error">("initializing");
   const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setPrefersReducedMotion(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  // Defensive: theme may transiently be undefined during fast refresh / SSR
  const theme: "dark" | "light" = themeProp === "light" ? "light" : "dark";

  // Expose imperative handle for parent to control zoom, reset, etc.
  useImperativeHandle(ref, () => ({
    getCameraSnapshot: () => {
      const map = mapRef.current;
      if (!map) return null;
      const padding = map.getPadding();
      const normalizedPadding: MapPadding = {
        top: padding.top ?? 0,
        right: padding.right ?? 0,
        bottom: padding.bottom ?? 0,
        left: padding.left ?? 0,
      };
      return captureCameraSnapshot({
        getCenter: () => {
          const center = map.getCenter();
          return [center.lng, center.lat];
        },
        getZoom: () => map.getZoom(),
        getBearing: () => map.getBearing(),
        getPitch: () => map.getPitch(),
        getPadding: () => normalizedPadding,
      });
    },
    isMapReady: () => mapReady && mapRef.current !== null,
    flyTo: (lat: number, lon: number, zoom?: number) => {
      mapRef.current?.flyTo({
        center: [lon, lat],
        zoom: zoom ?? mapRef.current?.getZoom() ?? 10,
        ...mapMotionOptions(prefersReducedMotion, 1200),
      });
    },
    fitBounds: (bounds: [[number, number], [number, number]]) => {
      mapRef.current?.fitBounds(bounds, { padding: 60, ...mapMotionOptions(prefersReducedMotion, 1200) });
    },
    zoomIn: () => mapRef.current?.zoomIn(),
    zoomOut: () => mapRef.current?.zoomOut(),
    resetView: () => {
      const map = mapRef.current;
      if (!map) return;
      const camera = buildPortugalOverviewCamera();
      map.stop();
      if (prefersReducedMotion) {
        map.jumpTo(camera);
      } else {
        map.flyTo({ ...camera, ...mapMotionOptions(false, 1200) });
      }
    },
    enterIncidentFocus: (target: IncidentFocusTarget) => {
      const map = mapRef.current;
      if (!map || !mapReady || !isValidIncidentCenter(target.center)) return null;

      const before = captureCameraSnapshot({
        getCenter: () => {
          const center = map.getCenter();
          return [center.lng, center.lat];
        },
        getZoom: () => map.getZoom(),
        getBearing: () => map.getBearing(),
        getPitch: () => map.getPitch(),
        getPadding: () => {
          const padding = map.getPadding();
          return {
            top: padding.top ?? 0,
            right: padding.right ?? 0,
            bottom: padding.bottom ?? 0,
            left: padding.left ?? 0,
          };
        },
      });
      const camera = buildIncidentFocusCamera(before, target);

      map.stop();
      if (prefersReducedMotion) {
        map.jumpTo(camera);
      } else {
        map.flyTo({ ...camera, ...mapMotionOptions(false, 650) });
      }
      return before;
    },
    exitIncidentFocus: (snapshot: CameraSnapshot | null) => {
      const map = mapRef.current;
      if (!map) return;
      map.stop();
      if (!snapshot) return;
      if (prefersReducedMotion) {
        map.jumpTo(snapshot);
      } else {
        map.flyTo({ ...snapshot, ...mapMotionOptions(false, 500) });
      }
    },
    returnToPortugalOverview: () => {
      const map = mapRef.current;
      if (!map) return;
      const camera = buildPortugalOverviewCamera();
      map.stop();
      if (prefersReducedMotion) {
        map.jumpTo(camera);
      } else {
        map.flyTo({ ...camera, ...mapMotionOptions(false, 900) });
      }
    },
    getZoom: () => mapRef.current?.getZoom() ?? 0,
    resize: () => mapRef.current?.resize(),
  }), [mapReady, prefersReducedMotion]);

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
      attributionControl: { compact: true },
      maxZoom: 16,
      minZoom: 4,
      dragRotate: false,
      pitchWithRotate: false,
      touchZoomRotate: true,
      touchPitch: false,
      cooperativeGestures: false,
    });

    mapRef.current = map;

    let initialStyleTimer: number | null = null;
    let overlayIdleId: number | null = null;
    let overlayTimer: number | null = null;
    const clearInitialStyleWatchdog = () => {
      if (initialStyleTimer !== null) window.clearTimeout(initialStyleTimer);
      initialStyleTimer = null;
      map.off("error", onInitialStyleError);
    };
    const markInitialStyleFailure = () => {
      if (mapLoadedRef.current || mapRef.current !== map || !initializedRef.current) return;
      setMapStyleState("retryable-error");
      setMapReady(false);
      setIncidentDataReady(false);
    };
    const onInitialStyleError = (event: maplibregl.ErrorEvent) => {
      if (!mapLoadedRef.current && isStyleLoadError(event)) markInitialStyleFailure();
    };
    map.on("error", onInitialStyleError);
    initialStyleTimer = window.setTimeout(markInitialStyleFailure, STYLE_LOAD_TIMEOUT_MS);

    const setupOverlays = () => {
      overlayIdleId = null;
      overlayTimer = null;
      if (mapRef.current !== map || !initializedRef.current) return;

      addEmberSourcesAndLayers(map, theme, basemap);
      currentStyleRef.current = pickStyle(basemap, theme);
      committedThemeRef.current = theme;
      committedBasemapRef.current = basemap;
      setMapLoaded(true);
      setMapStyleState("ready");
      setMapReady(true);
      // Broadcast map readiness to the LayerPanel system (lazy-loaded
      // advanced overlays: biomass, risk, aerial). Listens via window.
      dispatchMapEvent(MAP_READY_EVENT, map);
    };

    const scheduleOverlaySetup = () => {
      if (typeof window.requestIdleCallback === "function") {
        overlayIdleId = window.requestIdleCallback(setupOverlays, { timeout: 500 });
      } else {
        overlayTimer = setTimeout(setupOverlays, 0) as unknown as number;
      }
    };

    const cancelOverlaySetup = () => {
      if (overlayIdleId !== null) window.cancelIdleCallback(overlayIdleId);
      if (overlayTimer !== null) window.clearTimeout(overlayTimer);
      overlayIdleId = null;
      overlayTimer = null;
    };

    map.on("load", scheduleOverlaySetup);
    const onLoad = () => {
      clearInitialStyleWatchdog();
      mapLoadedRef.current = true;
    };
    map.on("load", onLoad);

    return () => {
      if (initialStyleTimer !== null) window.clearTimeout(initialStyleTimer);
      cancelOverlaySetup();
      map.off("error", onInitialStyleError);
      map.off("load", scheduleOverlaySetup);
      map.off("load", onLoad);
      styleTransitionRef.current.invalidate();
      map.remove();
      mapRef.current = null;
      initializedRef.current = false;
      mapLoadedRef.current = false;
      setMapLoaded(false);
      setMapReady(false);
      setIncidentDataReady(false);
      setMapStyleState("initializing");
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
    if (!initializedRef.current) return;

    const targetStyle = pickStyle(basemap, theme);

    // Skip if the CARTO style hasn't actually changed
    // During a pending transition, currentStyleRef still describes the last
    // committed style. Do not skip a requested reversal (for example,
    // dark -> light -> dark before the first style.load fires).
    if (shouldSkipStyleTransition({
      mapLoaded: mapLoadedRef.current,
      mapReady,
      currentStyle: currentStyleRef.current,
      targetStyle,
    })) return;

    const transitionToken = styleTransitionRef.current.begin();

    dispatchMapEvent(MAP_STYLE_TRANSITION_EVENT, map);

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMapStyleState("transitioning");
    setMapReady(false);
    setIncidentDataReady(false);

    const fallbackStyle = currentStyleRef.current || pickStyle(committedBasemapRef.current, committedThemeRef.current);
    const styleMap: StyleTransitionMap = {
      once: (_event, listener) => map.once("style.load", listener),
      on: (_event, listener) => {
        map.on("error", listener as (event: maplibregl.ErrorEvent) => void);
      },
      off: (event, listener) => {
        if (event === "style.load") {
          map.off("style.load", listener as () => void);
        } else {
          map.off("error", listener as (event: maplibregl.ErrorEvent) => void);
        }
      },
      setStyle: (style) => map.setStyle(style),
    };

    const runtime = createStyleTransitionRuntime({
      map: styleMap,
      targetStyle,
      fallbackStyle,
      timeoutMs: STYLE_LOAD_TIMEOUT_MS,
      scheduleTimeout: (callback, timeoutMs) => window.setTimeout(callback, timeoutMs),
      clearTimeout: (handle) => window.clearTimeout(handle as number),
      isCurrent: () =>
        styleTransitionRef.current.isCurrent(transitionToken) &&
        mapRef.current === map &&
        initializedRef.current,
      onCommit: (style, recovered) => {
        const replayTheme = recovered ? committedThemeRef.current : theme;
        const replayBasemap = recovered ? committedBasemapRef.current : basemap;
        addEmberSourcesAndLayers(map, replayTheme, replayBasemap);
        // Customize ocean/water color per theme and basemap.
        try {
          const mapStyle = map.getStyle();
          const layers = mapStyle.layers || [];
          // Find water/ocean layers and re-tint them
          const waterColor = pickWaterColor(replayTheme, replayBasemap);
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
        currentStyleRef.current = style;
        if (!recovered) {
          committedThemeRef.current = theme;
          committedBasemapRef.current = basemap;
        }
        setMapStyleState(recovered ? "recovered" : "ready");
        setMapReady(true);
        dispatchMapEvent(MAP_STYLE_RESTORED_EVENT, map);
      },
      onRetryableFailure: () => {
        if (!styleTransitionRef.current.isCurrent(transitionToken)) return;
        setMapStyleState("retryable-error");
        setMapReady(false);
        setIncidentDataReady(false);
      },
    });

    runtime.start();

    return () => {
      runtime.dispose();
      styleTransitionRef.current.invalidate(transitionToken);
    };
  }, [theme, basemap, mapLoaded]);

  // ---------------------------------------------------------
  // EFFECT 2b — Satellite raster overlay
  // Adds/removes the EOX Sentinel-2 raster layer on top of the base style.
  // Does NOT require mapReady — uses a direct check on the map instance.
  // ---------------------------------------------------------
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const styleGeneration = styleTransitionRef.current.current();

    // Wait for the map to be loaded enough to add layers
    const applySatellite = () => {
      if (
        !styleTransitionRef.current.isCurrent(styleGeneration) ||
        mapRef.current !== map ||
        !map.isStyleLoaded()
      ) {
        return;
      }

      // Add the satellite raster source if not present
      if (!map.getSource(SATELLITE_SOURCE_ID)) {
        map.addSource(SATELLITE_SOURCE_ID, {
          type: "raster",
          tiles: [SATELLITE_TILES],
          tileSize: 256,
          attribution: 'Sentinel-2 cloudless © EOX IT Services GmbH | Map data © OpenStreetMap contributors | FIRMS © NASA',
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

    return () => {
      map.off("style.load", applySatellite);
    };
  }, [basemap, mapReady, theme]);

  // ---------------------------------------------------------
  // EFFECT 3 — Update incidents source via setData()
  // ---------------------------------------------------------
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    const geojson = buildIncidentsGeoJSON(incidents, theme);
    if (!setGeoJSONSourceData(map, SOURCE_IDS.incidents, geojson)) return;
    const markIncidentDataReady = () => setIncidentDataReady(true);
    map.once("idle", markIncidentDataReady);
    return () => {
      map.off("idle", markIncidentDataReady);
    };
  }, [incidents, theme, mapReady]);

  // ---------------------------------------------------------
  // EFFECT 4 — Update satellite source
  // ---------------------------------------------------------
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    // When dedicated FIRMS showSatellite is active, let the FIRMS path own the satellite layer.
    // Timeline-based satellite (from incident.timeline) is secondary / sample-oriented.
    if (!visibleSources.has("satellite") || showSatellite) {
      setGeoJSONSourceData(map, SOURCE_IDS.satellite, {
        type: "FeatureCollection",
        features: [],
      });
      return;
    }

    const geojson = buildSatelliteGeoJSON(incidents);
    setGeoJSONSourceData(map, SOURCE_IDS.satellite, geojson);
  }, [incidents, visibleSources, mapReady, showSatellite]);

  // ---------------------------------------------------------
  // EFFECT 5 — Update community source
  // ---------------------------------------------------------
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    if (!visibleSources.has("community")) {
      setGeoJSONSourceData(map, SOURCE_IDS.community, {
        type: "FeatureCollection",
        features: [],
      });
      return;
    }

    const geojson = buildCommunityGeoJSON(incidents);
    setGeoJSONSourceData(map, SOURCE_IDS.community, geojson);
  }, [incidents, visibleSources, mapReady]);

  // ---------------------------------------------------------
  // EFFECT 6 — Update evacuation source
  // ---------------------------------------------------------
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    const geojson = buildEvacuationGeoJSON(incidents);
    setGeoJSONSourceData(map, SOURCE_IDS.evacuation, geojson);
  }, [incidents, mapReady]);

  // ---------------------------------------------------------
  // EFFECT 7 — Update selected incident halo
  // ---------------------------------------------------------
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    const selected = selectedIncidentId
      ? incidents.find((i) => i.id === selectedIncidentId) ?? null
      : null;
    const geojson = buildSelectedGeoJSON(selected);
    setGeoJSONSourceData(map, SOURCE_IDS.selected, geojson);
  }, [selectedIncidentId, incidents, mapReady]);

  // ---------------------------------------------------------
  // EFFECT 8 — Layer visibility based on visibleSources
  // ---------------------------------------------------------
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    if (!map.getLayer(LAYER_IDS.satelliteDots)) return;

    // Respect showSatellite for FIRMS separation
    const satVisible = (!showSatellite && visibleSources.has("satellite")) ? "visible" : "none";
    const commVisible = visibleSources.has("community") ? "visible" : "none";
    map.setLayoutProperty(LAYER_IDS.satelliteDots, "visibility", satVisible);
    map.setLayoutProperty(LAYER_IDS.communityDots, "visibility", commVisible);
  }, [visibleSources, mapReady, showSatellite]);

  // ---------------------------------------------------------
  // EFFECT 8b — Fire risk layer (IPMA municipalities)
  // ---------------------------------------------------------
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    const geojson: GeoJSON.FeatureCollection = {
      type: "FeatureCollection",
      features: fireRiskFeatures,
    };
    setGeoJSONSourceData(map, SOURCE_IDS.fireRisk, geojson);

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

    const geojson: GeoJSON.FeatureCollection = {
      type: "FeatureCollection",
      features: fireStationsFeatures,
    };
    setGeoJSONSourceData(map, SOURCE_IDS.fireStations, geojson);

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

    const geojson: GeoJSON.FeatureCollection = {
      type: "FeatureCollection",
      features: satelliteFeatures,
    };
    setGeoJSONSourceData(map, SOURCE_IDS.firmsSatellite, geojson);

    const firmsLayer = LAYER_IDS.satelliteDots + "-firms";
    if (map.getLayer(firmsLayer)) {
      map.setLayoutProperty(
        firmsLayer,
        "visibility",
        showSatellite ? "visible" : "none"
      );
    }
    if (map.getLayer(LAYER_IDS.satelliteDots)) {
      map.setLayoutProperty(
        LAYER_IDS.satelliteDots,
        "visibility",
        showSatellite ? "none" : "visible"
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
    const buildPopupHtml = (props: IncidentPopupProperties | null | undefined) => {
      const name = escapePopupText(props?.displayName || "Incident");
      const severity = escapePopupText(props?.severity || "—");
      const status = escapePopupText(props?.status || "—");
      const areaHa = safePopupNumber(props?.areaHa, 0);
      const sourceCount = Math.max(1, Math.trunc(safePopupNumber(props?.sourceCount, 1)));

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
      let features = map.queryRenderedFeatures([point.x, point.y], {
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
          let nearest: { feature: (typeof sourceFeatures)[number]; dist: number } | null = null;
          for (const f of sourceFeatures) {
            if (f.geometry.type !== "Point") continue;
            const [longitude, latitude] = f.geometry.coordinates;
            const p = map.project([longitude, latitude]);
            const dx = p.x - point.x;
            const dy = p.y - point.y;
            const d = Math.sqrt(dx * dx + dy * dy);
            if (d <= TOLERANCE_PX && (!nearest || d < nearest.dist)) {
              nearest = { feature: f, dist: d };
            }
          }
          if (nearest && nearest.feature.properties?.id) return [nearest.feature];
        }
      } catch {
        // querySourceFeatures throws if source not loaded yet — ignore
      }
      return [];
    };

    const onClick = (e: maplibregl.MapMouseEvent) => {
      // Prefer a concrete incident within the generous hit tolerance. This
      // keeps marker/list selection parity even when a nearby cluster is also
      // rendered; only an unresolved cluster falls through to zoom-in.
      const features = queryIncidentFeatures(e.point);
      if (features.length > 0) {
        const id = typeof features[0].properties?.id === "string" ? features[0].properties.id : undefined;
        if (id) {
          onSelectIncident(id);
          // On touch devices, also show popup on tap (since there's no hover)
          if (isTouchDevice) {
            popup.setLngLat(e.lngLat).setHTML(buildPopupHtml(features[0].properties)).addTo(map);
            // Auto-dismiss after 3 seconds on touch
            setTimeout(() => popup.remove(), 3000);
          }
          return;
        }
      }

      // Check if clicking an unresolved cluster — if so, zoom in toward it.
      const clusterFeatures = map.queryRenderedFeatures(e.point, {
        layers: [LAYER_IDS.incidentFill + "-clusters"],
      });
      if (clusterFeatures.length > 0) {
        const currentZoom = map.getZoom();
        const targetZoom = Math.min(currentZoom + 2, 14);
        map.flyTo({
          center: [e.lngLat.lng, e.lngLat.lat],
          zoom: targetZoom,
          ...mapMotionOptions(prefersReducedMotion, 500),
        });
        return;
      }

      // Click on empty area — clear selection + dismiss popup.
      const hit = map.queryRenderedFeatures(e.point);
      if (hit.length === 0) {
        onSelectIncident(null);
        popup.remove();
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
      const features = queryIncidentFeatures({ x, y });
      if (features.length > 0) {
        const id = typeof features[0].properties?.id === "string" ? features[0].properties.id : undefined;
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
    const onTouchStart = (e: MapTouchEvent) => {
      touchStart = { x: e.point.x, y: e.point.y };
      touchMoved = false;
      if (touchTimer) clearTimeout(touchTimer);
      touchTimer = setTimeout(() => {
        if (!touchMoved) onLongPressTrigger(touchStart.x, touchStart.y);
      }, 600);
    };
    const onTouchMove = (e: MapTouchEvent) => {
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
      map.on("touchstart", onTouchStart);
      map.on("touchmove", onTouchMove);
      map.on("touchend", onTouchEnd);
      map.on("touchcancel", onTouchEnd);
    }
    if (!isTouchDevice) {
      map.on("mousemove", onMouseMove);
      map.on("mouseout", onMouseLeave);
    }

    return () => {
      map.off("click", onClick);
      map.off("contextmenu", onContextMenu);
      if (isTouchDevice) {
        map.off("touchstart", onTouchStart);
        map.off("touchmove", onTouchMove);
        map.off("touchend", onTouchEnd);
        map.off("touchcancel", onTouchEnd);
      }
      if (!isTouchDevice) {
        map.off("mousemove", onMouseMove);
        map.off("mouseout", onMouseLeave);
      }
      popup.remove();
      if (popupHoverTimer) clearTimeout(popupHoverTimer);
      if (touchTimer) clearTimeout(touchTimer);
    };
  }, [onSelectIncident, mapReady, onMarkerLongPress, prefersReducedMotion]);

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
      ...mapMotionOptions(prefersReducedMotion, 1200),
    });
    // Clear the fly-to request after executing it
    if (onFlyToCleared) onFlyToCleared();
  }, [flyToIncidentId, incidents, mapReady, onFlyToCleared, prefersReducedMotion]);

  return (
    <div
      ref={containerRef}
      className={`ember-map-container ${className ?? ""}`}
      data-testid="ember-map"
      data-map-ready={mapReady ? "true" : "false"}
      data-incident-source-ready={incidentDataReady ? "true" : "false"}
      data-map-style-state={mapStyleState}
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

  // Critical incidents keep the flame color but gain a visible ring cue so
  // severity is not communicated by color alone.
  map.addLayer({
    id: LAYER_IDS.incidentCriticalCue,
    type: "circle",
    source: SOURCE_IDS.incidents,
    filter: ["all", ["!", ["has", "cluster"]], ["==", ["get", "severity"], "critical"]],
    paint: {
      "circle-radius": [
        "interpolate", ["linear"], ["zoom"],
        4, 7,
        8, 9,
        12, 12,
        16, 15,
      ],
      "circle-color": "rgba(0,0,0,0)",
      "circle-stroke-color": theme === "dark" ? "#fff7ed" : "#3b1710",
      "circle-stroke-width": 1.5,
      "circle-opacity": 0.95,
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

  // --- Source: satellite detections (timeline-based, e.g. samples) ---
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

  // --- Source: FIRMS satellite (raw NASA detections, dedicated layer) ---
  map.addSource(SOURCE_IDS.firmsSatellite, {
    type: "geojson",
    data: { type: "FeatureCollection", features: [] },
  });

  map.addLayer({
    id: LAYER_IDS.satelliteDots + "-firms",
    type: "circle",
    source: SOURCE_IDS.firmsSatellite,
    layout: { visibility: "none" },
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

  // Fire risk labels (simple text for now)
  map.addLayer({
    id: LAYER_IDS.fireRiskLabels,
    type: "symbol",
    source: SOURCE_IDS.fireRisk,
    layout: {
      visibility: "none",
      "text-field": ["to-string", ["get", "rcm"]],
      "text-size": 10,
      "text-anchor": "center",
      "text-allow-overlap": false,
    },
    paint: {
      "text-color": theme === "dark" ? "#f4ecdc" : "#1a1410",
      "text-halo-color": theme === "dark" ? "#0c1f1a" : "#fffdf7",
      "text-halo-width": 1,
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

  // Station labels
  map.addLayer({
    id: LAYER_IDS.fireStationsLabels,
    type: "symbol",
    source: SOURCE_IDS.fireStations,
    layout: {
      visibility: "none",
      "text-field": ["get", "name"],
      "text-size": 9,
      "text-anchor": "top",
      "text-offset": [0, 0.8],
      "text-allow-overlap": false,
    },
    paint: {
      "text-color": theme === "dark" ? "#f4ecdc" : "#1a1410",
      "text-halo-color": theme === "dark" ? "#0c1f1a" : "#fffdf7",
      "text-halo-width": 0.5,
    },
  });
}
