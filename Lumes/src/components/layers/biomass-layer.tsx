"use client";
// Lazy-loaded biomass overlay.
// Each instance fetches a GeoJSON of biomass cells in the current map
// bounds and renders them as a circle layer colored by tons/hectare.

import { useEffect, useState, type ReactElement } from "react";
import type { Map as MaplibreMap } from "maplibre-gl";
import type { Language } from "@/lib/i18n";
import { fetchJsonWithTimeout } from "@/lib/use-fetch";
import { setGeoJSONSourceData } from "@/lib/map/map-source";
import { normalizeBiomassOverlayResponse, type BiomassOverlayCollection } from "@/lib/biomass/overlay";

const SOURCE_ID = "biomass-overlay";
const LAYER_ID = "biomass-cells";
const INCIDENT_SYMBOL_LAYER = "ember-incidents-fill";
const REQUEST_TIMEOUT_MS = 10_000;

interface Props {
  map: MaplibreMap | null;
  enabled: boolean;
  lang: Language;
}
type BiomassLayerState = "loading" | "healthy" | "empty" | "error";

function statusCopy(state: Exclude<BiomassLayerState, "healthy">, lang: Language): string {
  if (state === "loading") return lang === "pt" ? "A carregar biomassa…" : "Loading biomass…";
  if (state === "empty") return lang === "pt" ? "Sem dados de biomassa nesta área" : "No biomass data for this area";
  return lang === "pt"
    ? "Biomassa indisponível · altere a camada para tentar novamente"
    : "Biomass unavailable · toggle the layer to retry";
}

function statusSurface(message: string): ReactElement {
  return (
    <div
      className="pointer-events-auto absolute left-4 bottom-20 z-30 max-w-xs rounded-lg border border-[var(--ember-warning)]/30 bg-[var(--ember-surface)]/95 px-3 py-2 text-[length:var(--type-secondary)] text-[var(--ember-warning)] shadow-[var(--ember-shadow-sm)] backdrop-blur"
      data-testid="biomass-layer-status"
      role="status"
      aria-live="polite"
    >
      {message}
    </div>
  );
}

export default function BiomassLayer({ map, enabled, lang }: Props) {
  const [state, setState] = useState<BiomassLayerState>("loading");
  const [cellCount, setCellCount] = useState(0);

  useEffect(() => {
    if (!map || !enabled) return;
    let cancelled = false;
    let inFlight = false;
    let activeController: AbortController | null = null;

    const clearOverlay = (): void => {
      try {
        if (map.getLayer(LAYER_ID)) map.removeLayer(LAYER_ID);
        if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID);
      } catch {
        // The style may be transitioning; the restoration boundary owns it.
      }
    };

    const fetchAndApply = async (): Promise<void> => {
      if (cancelled || inFlight) return;
      inFlight = true;
      const controller = new AbortController();
      activeController = controller;
      const bounds = map.getBounds();
      const bbox = `${bounds.getWest()},${bounds.getSouth()},${bounds.getEast()},${bounds.getNorth()}`;
      try {
        const raw = await fetchJsonWithTimeout(
          `/api/biomass/grid?bbox=${bbox}`,
          { controller, timeoutMs: REQUEST_TIMEOUT_MS },
        );
        if (cancelled) return;

        const normalized = normalizeBiomassOverlayResponse(raw);
        if (normalized.state === "empty") {
          clearOverlay();
          setCellCount(0);
          setState("empty");
          return;
        }
        if (normalized.state === "invalid") {
          clearOverlay();
          setCellCount(0);
          setState("error");
          return;
        }

        const data: BiomassOverlayCollection = normalized.data;
        if (map.getSource(SOURCE_ID)) {
          if (!setGeoJSONSourceData(map, SOURCE_ID, data)) {
            clearOverlay();
            setCellCount(0);
            setState("error");
            return;
          }
        } else {
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
          }, map.getLayer(INCIDENT_SYMBOL_LAYER) ? INCIDENT_SYMBOL_LAYER : undefined);
        }

        setCellCount(data.features.length);
        setState("healthy");
      } catch (error: unknown) {
        if (!cancelled && !(error instanceof DOMException && error.name === "AbortError")) {
          clearOverlay();
          setCellCount(0);
          setState("error");
        }
      } finally {
        if (activeController === controller) activeController = null;
        inFlight = false;
      }
    };

    setState("loading");
    setCellCount(0);
    void fetchAndApply();
    const onMove = () => void fetchAndApply();
    map.on("moveend", onMove);

    return () => {
      cancelled = true;
      activeController?.abort();
      map.off("moveend", onMove);
      clearOverlay();
    };
  }, [map, enabled]);

  if (!enabled) return null;
  if (state !== "healthy") return statusSurface(statusCopy(state, lang));

  return (
    <div
      className="pointer-events-auto absolute left-4 bottom-20 z-30 max-w-xs rounded-lg bg-zinc-900/90 px-3 py-2 text-[length:var(--type-secondary)] text-zinc-100 shadow-lg ring-1 ring-zinc-700 backdrop-blur"
      data-testid="biomass-layer-status"
      role="status"
      aria-live="polite"
    >
      {lang === "pt" ? `${cellCount} células de biomassa` : `${cellCount} biomass cells`}
    </div>
  );
}
