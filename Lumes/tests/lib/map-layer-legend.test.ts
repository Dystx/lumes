import { describe, expect, it } from "vitest";
import { deriveLayerAvailability, layerAvailabilityLabel, visibleLegendLayers, type MapLegendLayerState } from "@/lib/map-layer-legend";

const healthy: MapLegendLayerState = {
  satellite: "healthy",
  community: "healthy",
  evacuation: "healthy",
  fireRisk: "healthy",
};

describe("map layer legend", () => {
  it("keeps incident severity separate from optional layer explanations", () => {
    expect(visibleLegendLayers(healthy)).toEqual(["severity"]);
    expect(visibleLegendLayers(healthy, true)).toEqual([
      "severity", "satellite", "community", "evacuation", "fire-risk",
    ]);
  });

  it("does not show disabled or unavailable layers as active legend entries", () => {
    expect(visibleLegendLayers({
      ...healthy,
      satellite: "unavailable",
      community: "disabled",
      fireRisk: "disabled",
    }, true)).toEqual(["severity", "evacuation"]);
  });

  it("labels fallback and unavailable states explicitly", () => {
    expect(layerAvailabilityLabel("satellite", "unavailable", "en")).toBe("Unavailable");
    expect(layerAvailabilityLabel("satellite", "fallback", "pt")).toBe("Dados alternativos");
  });

  it("maps runtime fetch state to optional-layer availability", () => {
    expect(deriveLayerAvailability({ enabled: false, hasData: true })).toBe("disabled");
    expect(deriveLayerAvailability({ enabled: true, hasData: true, usingFallback: true })).toBe("fallback");
    expect(deriveLayerAvailability({ enabled: true, hasData: false, dataState: "retryable-error" })).toBe("unavailable");
    expect(deriveLayerAvailability({ enabled: true, hasData: true, dataState: "healthy" })).toBe("healthy");
  });
});
