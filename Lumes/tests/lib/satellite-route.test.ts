import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

describe("satellite route contract", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("FIRMS_MAP_KEY", "");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.doUnmock("@/lib/api/cache");
  });

  it("returns an explicit non-cacheable unavailable state without a key", async () => {
    const { GET } = await import("@/app/api/satellite/route");
    const response = await GET(new NextRequest("http://localhost/api/satellite"));

    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toMatchObject({
      count: 0,
      dataState: { state: "retryable-error", source: "nasa-firms-viirs" },
    });
  });

  it("parses configured FIRMS CSV and skips rows without coordinates", async () => {
    vi.stubEnv("FIRMS_MAP_KEY", "test-map-key");
    const fetchMock = vi.fn().mockResolvedValue(new Response([
      "latitude,longitude,acq_date,acq_time,frp,confidence,satellite,instrument,bright_ti4",
      "38.72,-9.14,2026-07-12,1145,12.5,high,Suomi-NPP,VIIRS,330.4",
      "not-a-lat,-9.10,2026-07-12,1146,5.0,nominal,Suomi-NPP,VIIRS,310.0",
      "38.72foo,-9.10,2026-07-12,1146,5.0,nominal,Suomi-NPP,VIIRS,310.0",
      "0,0,2026-07-12,1147,8.0,nominal,Suomi-NPP,VIIRS,310.0",
    ].join("\n"), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const { GET } = await import("@/app/api/satellite/route");
    const response = await GET(new NextRequest("http://localhost/api/satellite"));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("s-maxage=900");
    expect(fetchMock.mock.calls[0]?.[0]).toContain("/-9.5,36,42.2,-6/2");
    expect(payload).toMatchObject({
      source: "nasa-firms-viirs",
      count: 1,
      dataState: { state: "healthy", source: "nasa-firms-viirs" },
    });
    expect(payload.detections[0]).toMatchObject({
      geometry: { coordinates: [-9.14, 38.72] },
      properties: { frp: 12.5, confidence: 0.9 },
      severity: "high",
    });
  });

  it("skips malformed scalar metrics while preserving valid detections", async () => {
    vi.stubEnv("FIRMS_MAP_KEY", "test-map-key");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response([
      "latitude,longitude,acq_date,acq_time,frp,confidence,satellite,instrument,bright_ti4",
      "38.72,-9.14,2026-07-12,1145,12.5,high,Suomi-NPP,VIIRS,330.4",
      "38.73,-9.15,2026-07-12,1146,12foo,high,Suomi-NPP,VIIRS,330.4",
      "38.74,-9.16,2026-07-12,1147,Infinity,high,Suomi-NPP,VIIRS,330.4",
      "38.75,-9.17,2026-07-12,1148,-1.0,high,Suomi-NPP,VIIRS,330.4",
      "38.76,-9.18,2026-07-12,1149,5.0,nominal,Suomi-NPP,VIIRS,330foo",
      "38.77,-9.19,2026-07-12,1150,5.0,nominal,Suomi-NPP,VIIRS,Infinity",
      "38.78,-9.20,2026-07-12,1151,5.0,nominal,Suomi-NPP,VIIRS,-1",
    ].join("\n"), { status: 200 })));

    const { GET } = await import("@/app/api/satellite/route");
    const response = await GET(new NextRequest("http://localhost/api/satellite"));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      count: 1,
      dataState: { state: "healthy", source: "nasa-firms-viirs" },
      detections: [{ properties: { frp: 12.5, brightness: 330.4 }, severity: "high" }],
    });
    expect(Number.isFinite(payload.detections[0].properties.frp)).toBe(true);
    expect(Number.isFinite(payload.detections[0].properties.brightness)).toBe(true);
    expect(payload.detections[0].properties.frp).toBeGreaterThanOrEqual(0);
    expect(payload.detections[0].properties.brightness).toBeGreaterThanOrEqual(0);
  });

  it("returns a cacheable empty state when all scalar metrics are unusable", async () => {
    vi.stubEnv("FIRMS_MAP_KEY", "test-map-key");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response([
      "latitude,longitude,acq_date,acq_time,frp,confidence,satellite,instrument,bright_ti4",
      "38.72,-9.14,2026-07-12,1145,12foo,high,Suomi-NPP,VIIRS,330.4",
      "38.73,-9.15,2026-07-12,1146,5.0,nominal,Suomi-NPP,VIIRS,Infinity",
    ].join("\n"), { status: 200 })));

    const { GET } = await import("@/app/api/satellite/route");
    const response = await GET(new NextRequest("http://localhost/api/satellite"));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("s-maxage=900");
    expect(payload).toMatchObject({
      count: 0,
      detections: [],
      dataState: { state: "empty", source: "nasa-firms-viirs" },
    });
  });

  it("redacts a non-OK FIRMS response and prevents caching", async () => {
    vi.stubEnv("FIRMS_MAP_KEY", "test-map-key");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("private provider response", { status: 503 })));

    const { GET } = await import("@/app/api/satellite/route");
    const response = await GET(new NextRequest("http://localhost/api/satellite"));
    const payload = await response.json();

    expect(response.status).toBe(502);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(payload).toMatchObject({
      source: "nasa-firms-viirs",
      count: 0,
      detections: [],
      dataState: { state: "retryable-error", source: "nasa-firms-viirs" },
    });
    expect(JSON.stringify(payload)).not.toContain("private provider response");
  });

  it("redacts a FIRMS timeout and prevents caching", async () => {
    vi.stubEnv("FIRMS_MAP_KEY", "test-map-key");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("private timeout detail")));

    const { GET } = await import("@/app/api/satellite/route");
    const response = await GET(new NextRequest("http://localhost/api/satellite"));
    const payload = await response.json();

    expect(response.status).toBe(502);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(JSON.stringify(payload)).not.toContain("private timeout detail");
    expect(payload.dataState).toMatchObject({ state: "retryable-error" });
  });

  it("redacts cache failures and prevents caching", async () => {
    vi.stubEnv("FIRMS_MAP_KEY", "test-map-key");
    vi.doMock("@/lib/api/cache", () => ({
      cached: vi.fn().mockRejectedValue(new Error("private cache detail")),
    }));

    const { GET } = await import("@/app/api/satellite/route");
    const response = await GET(new NextRequest("http://localhost/api/satellite"));
    const payload = await response.json();

    expect(response.status).toBe(502);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(JSON.stringify(payload)).not.toContain("private cache detail");
    expect(payload.dataState).toMatchObject({ state: "retryable-error" });
  });

  it("returns a no-store rate-limit envelope before requesting FIRMS", async () => {
    vi.stubEnv("FIRMS_MAP_KEY", "test-map-key");
    const fetchMock = vi.fn().mockResolvedValue(new Response("latitude,longitude\n38.72,-9.14\n", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const { GET } = await import("@/app/api/satellite/route");
    const request = () => new NextRequest("http://localhost/api/satellite", {
      headers: { "x-real-ip": "satellite-rate-test" },
    });
    for (let index = 0; index < 60; index += 1) await GET(request());

    const response = await GET(request());
    const payload = await response.json();

    expect(response.status).toBe(429);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("retry-after")).toBe("60");
    expect(payload).toMatchObject({ dataState: { state: "retryable-error" } });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
