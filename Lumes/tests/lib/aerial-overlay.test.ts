import { describe, expect, it } from "vitest";
import { normalizeAerialOverlayResponse } from "@/lib/aerial/overlay";

const feature = {
  type: "Feature",
  geometry: { type: "Point", coordinates: [-9.14, 38.72, 1200] },
  properties: {
    aircraftType: "C172",
    registration: "CS-LUM",
    headingDeg: 90,
    altitudeBarometricFt: 1200,
    callsign: "LUME01",
  },
};

describe("aerial overlay response normalization", () => {
  it("normalizes healthy aircraft data", () => {
    expect(normalizeAerialOverlayResponse({
      type: "FeatureCollection",
      features: [feature],
      meta: { sources_live: 3 },
      dataState: { state: "healthy", updatedAt: "2026-07-13T10:00:00.000Z" },
    })).toEqual({ state: "healthy", data: { features: [feature], sourcesLive: 3, reason: null } });
  });

  it("retains aircraft while classifying partial provider coverage", () => {
    expect(normalizeAerialOverlayResponse({
      type: "FeatureCollection",
      features: [feature],
      meta: { sources_live: 1 },
      dataState: { state: "healthy", updatedAt: "2026-07-13T10:00:00.000Z", reason: "One source unavailable" },
    })).toMatchObject({ state: "partial", data: { sourcesLive: 1, reason: "One source unavailable" } });
  });

  it("distinguishes empty and malformed payloads", () => {
    expect(normalizeAerialOverlayResponse({
      type: "FeatureCollection", features: [], meta: { sources_live: 0 },
    }).state).toBe("empty");
    expect(normalizeAerialOverlayResponse({
      type: "FeatureCollection", features: [{ ...feature, geometry: { type: "Point", coordinates: ["bad", 1] } }],
    })).toEqual({ state: "invalid", reason: "Aerial response was malformed" });
  });

  it("drops finite aircraft points outside the response bbox", () => {
    expect(normalizeAerialOverlayResponse({
      type: "FeatureCollection",
      bbox: [-9.5, 36.95, -6, 42.15],
      features: [feature, {
        ...feature,
        geometry: { type: "Point", coordinates: [0, 0, 1200] },
      }],
      meta: { sources_live: 3 },
    })).toMatchObject({
      state: "healthy",
      data: { features: [feature] },
    });
  });

  it("rejects a malformed response bbox", () => {
    expect(normalizeAerialOverlayResponse({
      type: "FeatureCollection",
      bbox: [0, 0, 0, 0],
      features: [feature],
    })).toEqual({ state: "invalid", reason: "Aerial response bbox was malformed" });
  });

  it("rejects malformed or cardinality-inconsistent data-state metadata", () => {
    expect(normalizeAerialOverlayResponse({
      type: "FeatureCollection",
      features: [feature],
      dataState: { state: "healthy" },
    })).toEqual({ state: "invalid", reason: "Aerial response data state was malformed" });

    expect(normalizeAerialOverlayResponse({
      type: "FeatureCollection",
      features: [],
      dataState: { state: "healthy", updatedAt: "2026-07-13T10:00:00.000Z" },
    })).toEqual({ state: "invalid", reason: "Aerial response data state was inconsistent" });

    expect(normalizeAerialOverlayResponse({
      type: "FeatureCollection",
      features: [feature],
      dataState: { state: "retryable-error", updatedAt: "2026-07-13T10:00:00.000Z" },
    })).toEqual({ state: "invalid", reason: "Aerial response data state was inconsistent" });
  });
});
