"use client";
// Lazy-loaded composite fire-risk overlay.
//
// Strategy: we don't compute the risk per-pixel on the client; instead
// we hit /api/risk once per viewport (with the viewport's center) and
// show that. The cell-level rendering is reserved for the per-incident
// variant that uses /api/risk?lat=&lon=&incidentId=.

import { useEffect, useState, type ReactElement } from "react";
import type { Map as MaplibreMap } from "maplibre-gl";
import { fetchJsonWithTimeout } from "@/lib/use-fetch";
import { setGeoJSONSourceData } from "@/lib/map/map-source";
import { normalizeRiskOverlayResponse, type RiskOverlaySnapshot } from "@/lib/risk/overlay";
import type { Language } from "@/lib/i18n";

interface Props {
  map: MaplibreMap | null;
  enabled: boolean;
  lang: Language;
}

type RiskLayerState = "loading" | "healthy" | "empty" | "error";

const RISK_COLORS: Record<RiskOverlaySnapshot["category"], string> = {
  low: "#22c55e",
  moderate: "#eab308",
  high: "#ea580c",
  very_high: "#9f1239",
  extreme: "#581c87",
};

const SOURCE_ID = "risk-overlay";
const POINT_LAYER = "risk-point";
const INCIDENT_SYMBOL_LAYER = "ember-incidents-fill";
const REQUEST_TIMEOUT_MS = 10_000;

function statusCopy(state: Exclude<RiskLayerState, "healthy">, lang: Language): string {
  if (state === "loading") return lang === "pt" ? "A carregar risco…" : "Loading risk…";
  if (state === "empty") return lang === "pt" ? "Sem dados de risco nesta área" : "No risk data for this area";
  return lang === "pt"
    ? "Risco composto indisponível · altere a camada para tentar novamente"
    : "Composite risk unavailable · toggle the layer to retry";
}

function statusSurface(message: string): ReactElement {
  return (
    <div
      className="pointer-events-auto absolute left-4 bottom-20 z-30 max-w-xs rounded-lg border border-[var(--ember-warning)]/30 bg-[var(--ember-surface)]/95 px-3 py-2 text-[length:var(--type-secondary)] text-[var(--ember-warning)] shadow-[var(--ember-shadow-sm)] backdrop-blur"
      data-testid="risk-layer-status"
      role="status"
      aria-live="polite"
    >
      {message}
    </div>
  );
}

export default function RiskLayer({ map, enabled, lang }: Props) {
  const [snapshot, setSnapshot] = useState<RiskOverlaySnapshot | null>(null);
  const [state, setState] = useState<RiskLayerState>("loading");

  useEffect(() => {
    if (!map || !enabled) return;
    let cancelled = false;
    let inFlight = false;
    let activeController: AbortController | null = null;
    let interval: ReturnType<typeof setInterval> | null = null;

    const clearRiskOverlay = (): void => {
      try {
        if (map.getLayer(POINT_LAYER)) map.removeLayer(POINT_LAYER);
        if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID);
      } catch {
        // The style may be transitioning; the restoration boundary owns it.
      }
    };

    const fetchRisk = async (): Promise<void> => {
      if (cancelled || inFlight) return;
      inFlight = true;
      const controller = new AbortController();
      activeController = controller;
      const c = map.getCenter();
      try {
        const data = await fetchJsonWithTimeout(
          `/api/risk?lat=${c.lat}&lon=${c.lng}`,
          { controller, timeoutMs: REQUEST_TIMEOUT_MS },
        );
        if (cancelled) return;

        const normalized = normalizeRiskOverlayResponse(data, new Date().toISOString());
        if (normalized.state === "empty") {
          clearRiskOverlay();
          setSnapshot(null);
          setState("empty");
          return;
        }
        if (normalized.state === "invalid") {
          clearRiskOverlay();
          setSnapshot(null);
          setState("error");
          return;
        }

        const snap = normalized.snapshot;
        const feature: GeoJSON.Feature<GeoJSON.Point> = {
          type: "Feature",
          geometry: {
            type: "Point",
            coordinates: [c.lng, c.lat],
          },
          properties: { score: snap.score, category: snap.category },
        };
        const geojson: GeoJSON.FeatureCollection<GeoJSON.Point> = {
          type: "FeatureCollection",
          features: [feature],
        };
        const sourceExists = !!map.getSource(SOURCE_ID);
        if (sourceExists) {
          if (!setGeoJSONSourceData(map, SOURCE_ID, geojson)) {
            clearRiskOverlay();
            setSnapshot(null);
            setState("error");
            return;
          }
        } else {
          map.addSource(SOURCE_ID, { type: "geojson", data: geojson });
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
          }, map.getLayer(INCIDENT_SYMBOL_LAYER) ? INCIDENT_SYMBOL_LAYER : undefined);
        }

        setSnapshot(snap);
        setState("healthy");
      } catch (error: unknown) {
        if (!cancelled && !(error instanceof DOMException && error.name === "AbortError")) {
          clearRiskOverlay();
          setSnapshot(null);
          setState("error");
        }
      } finally {
        if (activeController === controller) activeController = null;
        inFlight = false;
      }
    };

    setSnapshot(null);
    setState("loading");
    void fetchRisk();
    interval = setInterval(() => void fetchRisk(), 5 * 60 * 1000);
    const onMove = () => void fetchRisk();
    map.on("moveend", onMove);

    return () => {
      cancelled = true;
      activeController?.abort();
      if (interval) clearInterval(interval);
      map.off("moveend", onMove);
      clearRiskOverlay();
    };

  }, [map, enabled]);

  if (!enabled) return null;
  if (state !== "healthy") return statusSurface(statusCopy(state, lang));
  if (!snapshot) return statusSurface(statusCopy("error", lang));

  return (
    <div
      className="pointer-events-auto absolute left-4 bottom-20 z-30 max-w-xs rounded-lg bg-zinc-900/90 px-3 py-2 text-zinc-100 shadow-lg ring-1 ring-zinc-700 backdrop-blur"
      data-testid="risk-layer-status"
      role="status"
      aria-live="polite"
    >
      <div className="flex items-baseline gap-2">
        <span
          className="text-2xl font-bold tabular-nums"
          style={{ color: RISK_COLORS[snapshot.category] }}
        >
          {snapshot.score.toFixed(0)}
        </span>
        <span className="text-xs uppercase tracking-wider text-zinc-400">
          {lang === "pt" ? "pontuação de risco" : "risk score"}
        </span>
      </div>
      <div className="mt-1 text-xs text-zinc-300">
        {lang === "pt" ? "categoria" : "category"}{" "}
        <span
          className="font-medium"
          style={{ color: RISK_COLORS[snapshot.category] }}
        >
          {snapshot.category}
        </span>
        {" · "}
        {lang === "pt" ? "ignição" : "ignition"}{" "}
        <span className="font-medium">{Math.round(snapshot.ignition * 100)}%</span>
        {" · "}
        {lang === "pt" ? "intensidade" : "intensity"}{" "}
        <span className="font-medium">{Math.round(snapshot.intensity * 100)}%</span>
      </div>
      <div className="mt-1 text-meta text-zinc-500">
        {lang === "pt" ? "bioma × meteorologia no centro do mapa · atualizado" : "biomass × weather at map center · updated"}{" "}
        {new Date(snapshot.fetchedAt).toLocaleTimeString(lang === "pt" ? "pt-PT" : "en-GB")}
      </div>
    </div>
  );
}
