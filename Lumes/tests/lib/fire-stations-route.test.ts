import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { invalidate } from "@/lib/api/cache";
import { GET } from "@/app/api/fire-stations/route";

describe("fire stations route contract", () => {
  beforeEach(() => invalidate());
  afterEach(() => vi.unstubAllGlobals());

  it("normalizes valid Overpass nodes and skips malformed elements", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      elements: [
        { type: "node", id: 10, lat: 39, lon: -8, tags: { name: "Quartel", "addr:city": "Coimbra" } },
        { type: "way", id: 11, lat: 39, lon: -8, tags: { name: "Not a node" } },
        { type: "node", id: "bad", lat: "bad", lon: null },
        { type: "node", id: 12, lat: 0, lon: 0, tags: { name: "Null Island" } },
      ],
    }), { status: 200 })));

    const response = await GET();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      source: "osm-overpass",
      count: 1,
      stations: [{ id: 10, lat: 39, lon: -8, name: "Quartel", city: "Coimbra" }],
      dataState: { state: "healthy" },
    });
  });

  it("uses the curated list when every Overpass mirror fails", async () => {
    invalidate();
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("overpass unavailable")));

    const response = await GET();
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.source).toBe("osm-overpass-fallback");
    expect(body.dataState).toMatchObject({ state: "fallback" });
    expect(body.count).toBeGreaterThan(0);
  });
});
