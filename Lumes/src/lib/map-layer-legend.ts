export type MapLegendLayer = "severity" | "satellite" | "community" | "evacuation" | "fire-risk";
export type LayerAvailability = "healthy" | "unavailable" | "fallback" | "disabled";

export interface MapLegendLayerState {
  satellite: LayerAvailability;
  community: LayerAvailability;
  evacuation: LayerAvailability;
  fireRisk: LayerAvailability;
}

/** Convert a fetch envelope into the small availability vocabulary used by the legend. */
export function deriveLayerAvailability({
  enabled,
  hasData,
  usingFallback = false,
  error = null,
  dataState = null,
}: {
  enabled: boolean;
  hasData: boolean;
  usingFallback?: boolean;
  error?: string | null;
  dataState?: string | null;
}): LayerAvailability {
  if (!enabled) return "disabled";
  if (usingFallback || dataState === "fallback") return "fallback";
  if (error || dataState === "error" || dataState === "retryable-error" || dataState === "empty") return "unavailable";
  return hasData || dataState === "healthy" ? "healthy" : "disabled";
}

/** The default map legend stays focused on incident comprehension. */
export function visibleLegendLayers(
  states: MapLegendLayerState,
  showLayerDetails = false,
): MapLegendLayer[] {
  if (!showLayerDetails) return ["severity"];
  const entries: MapLegendLayer[] = ["severity"];
  if (states.satellite === "healthy" || states.satellite === "fallback") entries.push("satellite");
  if (states.community === "healthy" || states.community === "fallback") entries.push("community");
  if (states.evacuation === "healthy" || states.evacuation === "fallback") entries.push("evacuation");
  if (states.fireRisk === "healthy" || states.fireRisk === "fallback") entries.push("fire-risk");
  return entries;
}

export function layerAvailabilityLabel(
  layer: MapLegendLayer,
  state: LayerAvailability,
  lang: "pt" | "en",
): string {
  if (state === "disabled") return lang === "pt" ? "Desativada" : "Disabled";
  if (state === "unavailable") return lang === "pt" ? "Indisponível" : "Unavailable";
  if (state === "fallback") return lang === "pt" ? "Dados alternativos" : "Fallback data";
  if (layer === "satellite") return lang === "pt" ? "Satélite disponível" : "Satellite available";
  if (layer === "fire-risk") return lang === "pt" ? "Risco IPMA disponível" : "IPMA risk available";
  return lang === "pt" ? "Disponível" : "Available";
}
