import { afterEach, describe, expect, it, vi } from "vitest";
import { mergeAircraft } from "@/lib/aerial/merge";

describe("aerial merge spatial contract", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("clips radius-provider results back to the requested bbox", async () => {
    vi.stubGlobal("fetch", vi.fn().mockImplementation((input: string | URL) => {
      const url = String(input);
      if (url.includes("airplanes.live")) {
        return Promise.resolve(new Response(JSON.stringify({ ac: [
          { hex: "inside", lat: 37.25, lon: -9.25, flight: "LUME01" },
          { hex: "outside", lat: 0, lon: 0, flight: "FALSE01" },
        ] }), { status: 200 }));
      }
      if (url.includes("adsb.fi")) {
        return Promise.resolve(new Response(JSON.stringify({ aircraft: [] }), { status: 200 }));
      }
      return Promise.resolve(new Response(JSON.stringify({ states: [[
        "opensky-outside", "FALSE02", "Test", 0, 0, 0, 0, 1000, false, 0, 90, 0, 0, "0000", 0, 0, 0,
      ]] }), { status: 200 }));
    }));

    const result = await mergeAircraft([-9.5, 37, -9, 37.5]);

    expect(result.features).toHaveLength(1);
    expect(result.features[0]?.properties.icao24).toBe("inside");
    expect(result.features[0]?.geometry.coordinates).toEqual([-9.25, 37.25, null]);
  });
});
