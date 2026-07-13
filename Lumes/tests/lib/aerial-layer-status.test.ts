import { describe, expect, it } from "vitest";
import {
  aerialLayerStatusLabel,
  deriveAerialLayerStatus,
  type AerialLayerStatus,
} from "@/lib/aerial/status";

describe("aerial layer status", () => {
  it("marks a complete non-empty provider response healthy", () => {
    expect(deriveAerialLayerStatus({
      httpOk: true,
      count: 12,
      helicopterCount: 2,
      sourcesLive: 3,
    })).toEqual({
      state: "healthy",
      count: 12,
      helicopterCount: 2,
      sourcesLive: 3,
      sourcesTotal: 3,
      reason: null,
    });
  });

  it("keeps partial provider health visible even when aircraft are present", () => {
    expect(deriveAerialLayerStatus({
      httpOk: true,
      count: 4,
      sourcesLive: 2,
      reason: "One or more aircraft sources were unavailable",
    })).toMatchObject({
      state: "partial",
      count: 4,
      sourcesLive: 2,
      sourcesTotal: 3,
      reason: "One or more aircraft sources were unavailable",
    });
  });

  it("distinguishes an empty complete response from an unavailable response", () => {
    expect(deriveAerialLayerStatus({
      httpOk: true,
      count: 0,
      sourcesLive: 3,
    }).state).toBe("empty");
    expect(deriveAerialLayerStatus({
      httpOk: false,
      count: 0,
      sourcesLive: 0,
    })).toMatchObject({ state: "error", reason: "Aerial source unavailable" });
  });

  it("labels status for the existing PT/EN advanced-layer controls", () => {
    const partial: AerialLayerStatus = {
      state: "partial",
      count: 4,
      helicopterCount: 1,
      sourcesLive: 2,
      sourcesTotal: 3,
      reason: "One or more aircraft sources were unavailable",
    };
    expect(aerialLayerStatusLabel(partial, "pt")).toBe("4 aeronaves · 2/3 fontes");
    expect(aerialLayerStatusLabel(partial, "en")).toBe("4 aircraft · 2/3 sources");
    expect(aerialLayerStatusLabel({ ...partial, state: "empty", count: 0 }, "pt")).toBe("Sem aeronaves");
  });
});
