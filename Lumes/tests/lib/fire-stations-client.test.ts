import { describe, expect, it } from "vitest";
import { normalizeFireStationsResponse, transformFireStationsResponse } from "@/lib/fire-stations-client";

function validStation(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 10,
    lat: 39,
    lon: -8,
    name: "Quartel de Coimbra",
    operator: "Bombeiros",
    phone: "+351 239 000 000",
    website: "https://example.test/station",
    wikidata: "Q123",
    city: "Coimbra",
    ...overrides,
  };
}

function validResponse(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    source: "osm-overpass",
    fetchedAt: "2026-07-13T10:01:00.000Z",
    count: 1,
    stations: [validStation()],
    dataState: {
      state: "healthy",
      updatedAt: "2026-07-13T10:01:00.000Z",
      sourceUpdatedAt: "2026-07-13T10:00:00.000Z",
      source: "osm-overpass",
    },
    ...overrides,
  };
}

describe("client fire-stations boundary", () => {
  it("normalizes a valid OSM station envelope", () => {
    expect(normalizeFireStationsResponse(validResponse())).toMatchObject({
      source: "osm-overpass",
      count: 1,
      stations: [{ id: 10, lat: 39, lon: -8, name: "Quartel de Coimbra" }],
      dataState: { state: "healthy", sourceUpdatedAt: "2026-07-13T10:00:00.000Z" },
    });
  });

  it("preserves the curated fallback and island coordinates", () => {
    expect(normalizeFireStationsResponse(validResponse({
      source: "osm-overpass-fallback",
      stations: [validStation({ id: -18, lat: 32.6669, lon: -16.9241 })],
      dataState: {
        state: "fallback",
        updatedAt: "2026-07-13T10:01:00.000Z",
        source: "osm-overpass-fallback",
        reason: "Overpass unavailable",
      },
      sourceNote: "Overpass unavailable",
    }))).toMatchObject({ source: "osm-overpass-fallback", dataState: { state: "fallback" }, stations: [{ id: -18 }] });
  });

  it("preserves explicit empty station data", () => {
    expect(normalizeFireStationsResponse(validResponse({
      count: 0,
      stations: [],
      dataState: { state: "empty", updatedAt: "2026-07-13T10:01:00.000Z", source: "osm-overpass" },
    }))).toMatchObject({ count: 0, stations: [], dataState: { state: "empty" } });
  });

  it("retains valid stations from a mixed payload when count matches", () => {
    expect(normalizeFireStationsResponse(validResponse({
      stations: [validStation(), validStation({ id: "bad", lat: 0, lon: 0 })],
      count: 1,
    }))?.stations.map((station) => station.id)).toEqual([10]);
  });

  it.each([
    ["invalid source", { source: "station-provider" }],
    ["invalid fetched timestamp", { fetchedAt: "not-a-date" }],
    ["invalid coordinate", { stations: [validStation({ lat: 0 })] }],
    ["invalid station id", { stations: [validStation({ id: 1.5 })] }],
    ["count mismatch", { count: 2 }],
    ["invalid metadata", { dataState: { state: "healthy", updatedAt: "not-a-date" } }],
  ])("rejects envelopes with %s", (_label, overrides) => {
    expect(normalizeFireStationsResponse(validResponse(overrides))).toBeNull();
  });

  it("rejects duplicate IDs and all-invalid non-empty rows", () => {
    expect(normalizeFireStationsResponse(validResponse({ stations: [validStation(), validStation()] , count: 2 }))).toBeNull();

    const response = validResponse({ stations: [validStation({ lat: 0 })], count: 0 });
    expect(normalizeFireStationsResponse(response)).toBeNull();
    expect(() => transformFireStationsResponse(response)).toThrow("Invalid fire-stations response envelope");
  });
});
