import { describe, expect, it } from "vitest";
import { normalizeWeatherResponse, transformWeatherResponse } from "@/lib/weather-client";

function validObservation(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    stationId: "1",
    stationName: "Lisboa",
    stationLat: 38.72,
    stationLon: -9.14,
    timestamp: "2026-07-13T10:00:00.000Z",
    temperature: 25,
    humidity: 30,
    windSpeedKmh: 10,
    windDirectionId: 2,
    precipitation: 0,
    radiation: 150,
    pressure: 1012,
    ...overrides,
  };
}

function validResponse(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    source: "ipma",
    fetchedAt: "2026-07-13T10:01:00.000Z",
    timestamp: "2026-07-13T10:00:00.000Z",
    count: 1,
    observations: [validObservation()],
    cached: false,
    dataState: {
      state: "healthy",
      updatedAt: "2026-07-13T10:01:00.000Z",
      sourceUpdatedAt: "2026-07-13T10:00:00.000Z",
      source: "ipma",
    },
    ...overrides,
  };
}

describe("client weather boundary", () => {
  it("normalizes a valid IPMA envelope and preserves provider freshness", () => {
    expect(normalizeWeatherResponse(validResponse())).toMatchObject({
      source: "ipma",
      count: 1,
      timestamp: "2026-07-13T10:00:00.000Z",
      observations: [{ stationId: "1", humidity: 30 }],
      dataState: { state: "healthy", sourceUpdatedAt: "2026-07-13T10:00:00.000Z" },
    });
  });

  it("preserves explicit empty weather with an empty provider timestamp", () => {
    expect(normalizeWeatherResponse(validResponse({
      timestamp: "",
      count: 0,
      observations: [],
      dataState: {
        state: "empty",
        updatedAt: "2026-07-13T10:01:00.000Z",
        source: "ipma",
      },
    }))).toMatchObject({
      count: 0,
      timestamp: "",
      observations: [],
      dataState: { state: "empty" },
    });
  });

  it("retains valid observations from a mixed payload when count matches", () => {
    expect(normalizeWeatherResponse(validResponse({
      count: 1,
      observations: [validObservation(), validObservation({ stationId: "bad", humidity: 120 })],
    }))?.observations.map((observation) => observation.stationId)).toEqual(["1"]);
  });

  it("allows station metadata without coordinates", () => {
    expect(normalizeWeatherResponse(validResponse({
      observations: [validObservation({ stationLat: undefined, stationLon: undefined })],
    }))?.observations[0]).toMatchObject({ stationId: "1" });
  });

  it.each([
    ["invalid source", { source: "weather-provider" }],
    ["invalid fetched timestamp", { fetchedAt: "not-a-date" }],
    ["invalid observation timestamp", { observations: [validObservation({ timestamp: "not-a-date" })] }],
    ["invalid coordinates", { observations: [validObservation({ stationLat: 51, stationLon: 0 })] }],
    ["invalid humidity", { observations: [validObservation({ humidity: 101 })] }],
    ["invalid direction", { observations: [validObservation({ windDirectionId: 2.5 })] }],
    ["timestamp/count mismatch", { timestamp: "", count: 1 }],
    ["invalid metadata", { dataState: { state: "healthy", updatedAt: "not-a-date" } }],
    ["invalid cached flag", { cached: "false" }],
  ])("rejects envelopes with %s", (_label, overrides) => {
    expect(normalizeWeatherResponse(validResponse(overrides))).toBeNull();
  });

  it("rejects all-invalid non-empty rows and the transform fails closed", () => {
    const response = validResponse({
      count: 0,
      observations: [validObservation({ temperature: "hot" })],
    });

    expect(normalizeWeatherResponse(response)).toBeNull();
    expect(() => transformWeatherResponse(response)).toThrow("Invalid weather response envelope");
  });
});
