import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { invalidate } from "@/lib/api/cache";
import { GET } from "@/app/api/regional-commands/route";
import { NextRequest } from "next/server";

describe("regional commands route contract", () => {
  beforeEach(() => {
    invalidate();
    vi.stubGlobal("fetch", vi.fn().mockImplementation(() => Promise.resolve(new Response(JSON.stringify({
      features: [{
        properties: { ID: 7, ComReg: "Norte", Shape__Area: 12.5 },
        geometry: { type: "Polygon", coordinates: [[[-8.1, 41.1], [-8.0, 41.1], [-8.0, 41.2]]] },
      }],
    }), { status: 200 }))));
  });

  afterEach(() => vi.unstubAllGlobals());

  it("normalizes ArcGIS features and keeps geometry opt-in", async () => {
    const compact = await GET(new NextRequest("http://localhost/api/regional-commands"));
    await expect(compact.json()).resolves.toMatchObject({
      source: "anepc-regional-commands",
      count: 1,
      dataState: { state: "healthy" },
      commands: [{ id: "anepc-cmd-7", name: "Norte", geometry: null }],
    });

    invalidate();
    const withGeometry = await GET(new NextRequest("http://localhost/api/regional-commands?geometry=1"));
    await expect(withGeometry.json()).resolves.toMatchObject({
      commands: [{ geometry: { type: "Polygon" } }],
    });
  });

  it("drops malformed geometry instead of coercing coordinates to zero", async () => {
    invalidate();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      features: [{
        properties: { ID: 8, ComReg: "Centro" },
        geometry: { type: "Polygon", coordinates: [[[-8.1, 41.1], ["bad", 41.1], [-8.0, 41.2]]] },
      }],
    }), { status: 200 })));

    const response = await GET(new NextRequest("http://localhost/api/regional-commands?geometry=1"));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.commands).toEqual([{ id: "anepc-cmd-8", name: "Centro", region: "Centro", geometry: null }]);
  });

  it("returns a redacted, non-cacheable retryable state when ArcGIS is unavailable", async () => {
    invalidate();
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("private arcgis token detail")));

    const response = await GET(new NextRequest("http://localhost/api/regional-commands"));
    const payload = await response.json();

    expect(response.status).toBe(502);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(payload).toMatchObject({
      source: "anepc-regional-commands",
      count: 0,
      commands: [],
      dataState: { state: "retryable-error" },
    });
    expect(JSON.stringify(payload)).not.toContain("private arcgis token detail");
  });

  it("maps non-OK ArcGIS responses to the same redacted retryable contract", async () => {
    invalidate();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("upstream private body", { status: 503 })));

    const response = await GET(new NextRequest("http://localhost/api/regional-commands"));
    const payload = await response.json();

    expect(response.status).toBe(502);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(payload).toMatchObject({ dataState: { state: "retryable-error" }, commands: [] });
    expect(JSON.stringify(payload)).not.toContain("upstream private body");
  });

  it("keeps malformed successful ArcGIS payloads as an explicit empty state", async () => {
    invalidate();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ nope: true }), { status: 200 })));

    const response = await GET(new NextRequest("http://localhost/api/regional-commands"));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("s-maxage=86400");
    expect(payload).toMatchObject({
      count: 0,
      commands: [],
      dataState: { state: "empty", source: "anepc-regional-commands" },
    });
  });
});
