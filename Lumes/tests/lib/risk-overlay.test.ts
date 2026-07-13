import { describe, expect, it } from "vitest";
import { normalizeRiskOverlayResponse } from "@/lib/risk/overlay";

const healthyPayload = {
  fetchedAt: "2026-07-12T12:00:00.000Z",
  risk: {
    score: 72.4,
    category: "very_high",
    ignitionLikelihood: 0.82,
    intensityPotential: 0.67,
  },
  dataState: { state: "healthy" },
};

describe("risk overlay response normalization", () => {
  it("normalizes a healthy response into the display snapshot", () => {
    expect(normalizeRiskOverlayResponse(healthyPayload, "2026-07-12T13:00:00.000Z")).toEqual({
      state: "healthy",
      snapshot: {
        score: 72.4,
        category: "very_high",
        fetchedAt: "2026-07-12T12:00:00.000Z",
        ignition: 0.82,
        intensity: 0.67,
      },
    });
  });

  it("bounds numeric values before they reach the UI", () => {
    expect(normalizeRiskOverlayResponse({
      ...healthyPayload,
      risk: {
        ...healthyPayload.risk,
        score: 200,
        ignitionLikelihood: -1,
        intensityPotential: 4,
      },
    }, "2026-07-12T13:00:00.000Z")).toMatchObject({
      state: "healthy",
      snapshot: { score: 100, ignition: 0, intensity: 1 },
    });
  });

  it("distinguishes an explicit empty response from malformed data", () => {
    expect(normalizeRiskOverlayResponse({
      dataState: { state: "empty", reason: "No biomass data" },
    }, "2026-07-12T13:00:00.000Z")).toEqual({
      state: "empty",
      reason: "No biomass data",
    });
    expect(normalizeRiskOverlayResponse({ risk: { score: 42 } }, "2026-07-12T13:00:00.000Z")).toEqual({
      state: "invalid",
      reason: "Risk response was malformed",
    });
  });

  it("rejects unknown categories and non-finite scores", () => {
    expect(normalizeRiskOverlayResponse({
      ...healthyPayload,
      risk: { ...healthyPayload.risk, category: "unknown" },
    }, "2026-07-12T13:00:00.000Z").state).toBe("invalid");
    expect(normalizeRiskOverlayResponse({
      ...healthyPayload,
      risk: { ...healthyPayload.risk, score: "72" },
    }, "2026-07-12T13:00:00.000Z").state).toBe("invalid");
  });
});
