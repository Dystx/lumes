import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { cached } = vi.hoisted(() => ({ cached: vi.fn() }));

vi.mock("@/lib/api/cache", () => ({ cached }));

import { GET } from "@/app/api/source-health/route";

const healthyProviderResponse = {
  count: 1,
  dataState: {
    state: "healthy",
    sourceUpdatedAt: "2026-07-12T10:00:00.000Z",
  },
  source: "test",
};

function stubProviderResponses(
  overrides: Record<string, Response | Error | Record<string, unknown>> = {},
): void {
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    const path = new URL(String(input)).pathname;
    const override = overrides[path] ?? healthyProviderResponse;
    if (override instanceof Error) throw override;
    if (override instanceof Response) return override;
    return new Response(JSON.stringify(override), { status: 200 });
  }));
}

describe("source health fallback provenance", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cached.mockImplementation(async (_key: string, _ttl: number, loader: () => Promise<unknown>) => loader());
    vi.stubEnv("PORT", "3300");
    vi.stubEnv("SOURCE_HEALTH_HOST", "127.0.0.1");
    stubProviderResponses({
      "/api/fire-stations": {
        source: "osm-overpass-fallback",
        count: 19,
        stations: [],
        sourceNote: "Overpass mirrors unavailable — serving curated list",
        dataState: {
          state: "fallback",
          sourceUpdatedAt: "2026-07-12T10:00:00.000Z",
        },
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("keeps the fallback reason visible to source health consumers", async () => {
    const response = await GET();
    const payload = await response.json() as {
      sources: Array<{ sourceId: string; state?: string; lastError: string | null; sourceUpdatedAt?: string | null }>;
    };
    const stations = payload.sources.find((source) => source.sourceId === "osm-fire-stations");

    expect(stations).toMatchObject({
      state: "fallback",
      lastError: "Overpass mirrors unavailable — serving curated list",
      sourceUpdatedAt: "2026-07-12T10:00:00.000Z",
    });
  });

  it("classifies malformed provider bodies as errors instead of stale data", async () => {
    stubProviderResponses({
      "/api/incidents": new Response(JSON.stringify({ count: "oops", secret: "provider-token" }), { status: 200 }),
    });

    const response = await GET();
    const payload = await response.json();
    const incidents = payload.sources.find((source: { sourceId: string }) => source.sourceId === "anepc-prociv-arcgis");

    expect(response.status).toBe(200);
    expect(incidents).toMatchObject({
      status: "error",
      state: "error",
      dataState: "retryable-error",
      recordCount: 0,
      lastError: "Invalid source response",
    });
    expect(payload.dataState).toMatchObject({ state: "retryable-error" });
    expect(JSON.stringify(payload)).not.toContain("provider-token");
  });

  it("classifies non-200 provider responses without exposing response bodies", async () => {
    stubProviderResponses({
      "/api/fire-risk": new Response(JSON.stringify({ error: "secret-upstream-detail" }), { status: 503 }),
    });

    const response = await GET();
    const payload = await response.json();
    const fireRisk = payload.sources.find((source: { sourceId: string }) => source.sourceId === "ipma-fire-risk");

    expect(fireRisk).toMatchObject({
      status: "error",
      state: "error",
      lastError: "Source returned HTTP 503",
    });
    expect(JSON.stringify(payload)).not.toContain("secret-upstream-detail");
  });

  it("keeps empty providers stale and rejects invalid timestamps", async () => {
    stubProviderResponses({
      "/api/weather": {
        count: 0,
        dataState: { state: "empty", sourceUpdatedAt: "2026-07-12T10:00:00.000Z" },
      },
      "/api/regional-commands": {
        count: 1,
        dataState: { state: "healthy", sourceUpdatedAt: "not-a-date" },
      },
    });

    const response = await GET();
    const payload = await response.json();
    const weather = payload.sources.find((source: { sourceId: string }) => source.sourceId === "ipma-weather");
    const regionalCommands = payload.sources.find((source: { sourceId: string }) => source.sourceId === "anepc-regional-commands");

    expect(weather).toMatchObject({
      status: "stale",
      state: "stale",
      recordCount: 0,
      sourceUpdatedAt: "2026-07-12T10:00:00.000Z",
    });
    expect(regionalCommands).toMatchObject({
      status: "error",
      state: "error",
      lastError: "Invalid source response",
    });
  });

  it("preserves explicit stale and disabled provider states with their reasons", async () => {
    stubProviderResponses({
      "/api/weather": {
        count: 1,
        dataState: { state: "stale", reason: "Provider data is older than the freshness window" },
      },
      "/api/fire-stations": {
        count: 0,
        dataState: { state: "disabled", reason: "Layer disabled for this deployment" },
      },
    });

    const response = await GET();
    const payload = await response.json();
    const weather = payload.sources.find((source: { sourceId: string }) => source.sourceId === "ipma-weather");
    const stations = payload.sources.find((source: { sourceId: string }) => source.sourceId === "osm-fire-stations");

    expect(weather).toMatchObject({
      status: "stale",
      state: "stale",
      lastError: "Provider data is older than the freshness window",
    });
    expect(stations).toMatchObject({
      status: "disabled",
      state: "disabled",
      dataState: "disabled",
      lastError: "Layer disabled for this deployment",
    });
  });

  it("does not invent source freshness when a provider omits its timestamp", async () => {
    stubProviderResponses({
      "/api/incidents": { count: 1 },
      "/api/fire-risk": { count: 1 },
      "/api/weather": { count: 1 },
      "/api/fire-stations": { count: 1 },
      "/api/weather-warnings": { count: 1 },
      "/api/regional-commands": { count: 1 },
    });

    const response = await GET();
    const payload = await response.json();
    const incidents = payload.sources.find((source: { sourceId: string }) => source.sourceId === "anepc-prociv-arcgis");

    expect(incidents).toMatchObject({ status: "ok", state: "healthy", sourceUpdatedAt: null });
    expect(payload.dataState).not.toHaveProperty("sourceUpdatedAt");
  });

  it("rejects invalid data-state and count values", async () => {
    stubProviderResponses({
      "/api/weather-warnings": { count: -1, dataState: { state: "healthy" } },
      "/api/fire-stations": { count: 1, dataState: { state: "unknown" } },
    });

    const response = await GET();
    const payload = await response.json();
    const warnings = payload.sources.find((source: { sourceId: string }) => source.sourceId === "ipma-warnings");
    const stations = payload.sources.find((source: { sourceId: string }) => source.sourceId === "osm-fire-stations");

    expect(warnings).toMatchObject({ status: "error", state: "error", lastError: "Invalid source response" });
    expect(stations).toMatchObject({ status: "error", state: "error", lastError: "Invalid source response" });
  });

  it("classifies a rejected provider as a redacted retryable source error", async () => {
    stubProviderResponses({ "/api/incidents": new Error("private provider token") });

    const response = await GET();
    const payload = await response.json();
    const incidents = payload.sources.find((source: { sourceId: string }) => source.sourceId === "anepc-prociv-arcgis");

    expect(incidents).toMatchObject({
      status: "error",
      state: "error",
      lastError: "Source unavailable",
    });
    expect(JSON.stringify(payload)).not.toContain("private provider token");
  });

  it("redacts aggregation failures and prevents caching", async () => {
    cached.mockRejectedValueOnce(new Error("private source-health aggregation detail"));

    const response = await GET();
    const payload = await response.json();

    expect(response.status).toBe(502);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(payload).toMatchObject({
      sources: [],
      dataState: { state: "retryable-error", source: "core" },
    });
    expect(JSON.stringify(payload)).not.toContain("private source-health aggregation detail");
  });

  it("publishes the bounded public cache contract for successful aggregation", async () => {
    const response = await GET();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("public, s-maxage=30, stale-while-revalidate=60");
  });
});
