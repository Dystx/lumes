import { describe, expect, it } from "vitest";
import { normalizeBiomassOverlayResponse } from "@/lib/biomass/overlay";

const feature = {
  type: "Feature",
  geometry: { type: "Point", coordinates: [-9.14, 38.72] },
  properties: {
    tonsPerHectare: 12,
    species: "maritime_pine",
    speciesLabel: "Pinheiro bravo",
    rateOfSpread: "high",
    fuelModel: "timber",
  },
};

describe("biomass overlay response normalization", () => {
  it("keeps valid GeoJSON cells and stable properties", () => {
    expect(normalizeBiomassOverlayResponse({
      type: "FeatureCollection",
      features: [feature],
      dataState: { state: "healthy" },
    })).toEqual({ state: "healthy", data: { type: "FeatureCollection", features: [feature] } });
  });

  it("distinguishes an empty grid from malformed payloads", () => {
    expect(normalizeBiomassOverlayResponse({
      type: "FeatureCollection",
      features: [],
      dataState: { state: "empty", reason: "No biomass data" },
    })).toEqual({ state: "empty", reason: "No biomass data" });
    expect(normalizeBiomassOverlayResponse({ type: "FeatureCollection", features: [{ nope: true }] })).toEqual({
      state: "invalid",
      reason: "Biomass response was malformed",
    });
  });

  it("rejects invalid coordinates and negative biomass values", () => {
    expect(normalizeBiomassOverlayResponse({
      type: "FeatureCollection",
      features: [{ ...feature, geometry: { type: "Point", coordinates: ["bad", 38.72] } }],
    }).state).toBe("invalid");
    expect(normalizeBiomassOverlayResponse({
      type: "FeatureCollection",
      features: [{ ...feature, properties: { ...feature.properties, tonsPerHectare: -1 } }],
    }).state).toBe("invalid");
  });
});
