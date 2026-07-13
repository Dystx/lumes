import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { resetRateLimit } from "@/lib/api/rate-limit";
import { GET as riskGet } from "@/app/api/risk/route";

describe("viewport composite-risk route", () => {
  beforeEach(() => resetRateLimit());

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns a healthy cacheable snapshot for a Portugal coordinate", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      current: {
        temperature_2m: 31,
        relative_humidity_2m: 25,
        wind_speed_10m: 22,
        wind_direction_10m: 180,
        precipitation: 0,
      },
    }), { status: 200 })));

    const response = await riskGet(new NextRequest("http://localhost/api/risk?lat=38.72&lon=-9.14"));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("s-maxage=300");
    expect(payload).toMatchObject({
      dataState: { state: "healthy", source: "open-meteo" },
      risk: { category: expect.any(String), score: expect.any(Number) },
    });
  });

  it("returns a redacted retryable no-store envelope when weather fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("private weather token")));

    const response = await riskGet(new NextRequest("http://localhost/api/risk?lat=38.72&lon=-9.14"));
    const payload = await response.json();

    expect(response.status).toBe(502);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(payload).toMatchObject({ dataState: { state: "retryable-error" } });
    expect(JSON.stringify(payload)).not.toContain("private weather token");
  });

  it("rejects malformed successful weather payloads instead of publishing non-finite risk", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      current: {
        temperature_2m: 31,
        relative_humidity_2m: "dry",
        wind_speed_10m: 22,
        wind_direction_10m: 180,
        precipitation: 0,
      },
    }), { status: 200 })));

    const response = await riskGet(new NextRequest("http://localhost/api/risk?lat=38.72&lon=-9.14"));
    const payload = await response.json();

    expect(response.status).toBe(502);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(payload).toMatchObject({ dataState: { state: "retryable-error" } });
    expect(JSON.stringify(payload)).not.toContain("NaN");
  });
});
