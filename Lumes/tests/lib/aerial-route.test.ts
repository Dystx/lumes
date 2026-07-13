import { beforeEach, describe, expect, it, vi } from "vitest";
import { invalidate } from "@/lib/api/cache";

const { mergeAircraft } = vi.hoisted(() => ({ mergeAircraft: vi.fn() }));

vi.mock("@/lib/aerial/merge", async () => {
  const actual = await vi.importActual<typeof import("@/lib/aerial/merge")>("@/lib/aerial/merge");
  return { ...actual, mergeAircraft };
});

import { GET } from "@/app/api/aerial/route";
import { NextRequest } from "next/server";

describe("aerial route contract", () => {
  beforeEach(() => {
    invalidate();
    vi.clearAllMocks();
    mergeAircraft.mockResolvedValue({
      type: "FeatureCollection",
      fetchedAt: "2026-07-12T10:00:00.000Z",
      bbox: [-9.5, 36.95, -6, 42.15],
      features: [],
      meta: { airplanes_live: 0, adsb_fi: 0, opensky: 0, merged: 0, sources_live: 0, sub_queries: 1 },
      errors: [],
    });
  });

  it("returns a typed empty-state envelope for a reachable feed", async () => {
    const response = await GET(new NextRequest("http://localhost/api/aerial"));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      type: "FeatureCollection",
      dataState: { state: "empty", source: "adsb-merge" },
    });
  });

  it("preserves aircraft while exposing partial provider errors", async () => {
    mergeAircraft.mockResolvedValueOnce({
      type: "FeatureCollection",
      fetchedAt: "2026-07-12T10:00:00.000Z",
      bbox: [-9.5, 36.95, -6, 42.15],
      features: [{
        type: "Feature",
        geometry: { type: "Point", coordinates: [-9.14, 38.72, 1200] },
        properties: { icao24: "abc123", callsign: "LUME01", source: "opensky" },
      }],
      meta: { airplanes_live: 0, adsb_fi: 0, opensky: 1, merged: 1, sources_live: 1, sub_queries: 1 },
      errors: ["airplanes.live: upstream unavailable"],
    });

    const response = await GET(new NextRequest("http://localhost/api/aerial"));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.features).toHaveLength(1);
    expect(payload.features[0].properties.icao24).toBe("abc123");
    expect(payload.errors).toEqual(["airplanes.live: upstream unavailable"]);
    expect(payload.dataState).toMatchObject({
      state: "healthy",
      reason: "One or more aircraft sources were unavailable",
      source: "adsb-merge",
    });
  });

  it("redacts merge failures and prevents caching", async () => {
    mergeAircraft.mockRejectedValueOnce(new Error("private ADS-B provider detail"));

    const response = await GET(new NextRequest("http://localhost/api/aerial"));
    const payload = await response.json();

    expect(response.status).toBe(502);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(payload).toMatchObject({
      source: "adsb-merge",
      type: "FeatureCollection",
      features: [],
      dataState: { state: "retryable-error", source: "adsb-merge" },
    });
    expect(JSON.stringify(payload)).not.toContain("private ADS-B provider detail");
  });
});
