import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { cached } = vi.hoisted(() => ({ cached: vi.fn() }));

vi.mock("@/lib/api/cache", () => ({ cached }));

import { GET } from "@/app/api/weather-warnings/route";

const validWarning = {
  idAreaAviso: "LSB",
  awarenessTypeName: "Wind",
  awarenessLevelID: "orange",
  startTime: "2026-07-12T10:00:00Z",
  endTime: "2026-07-12T20:00:00Z",
  text: "Wind",
};

describe("weather warnings route contract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cached.mockImplementation(async (_key: string, _ttl: number, loader: () => Promise<unknown>) => loader());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("keeps only recognized warning levels and returns a typed state", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify([
      validWarning,
      { ...validWarning, awarenessTypeName: "None", awarenessLevelID: "green" },
      { awarenessLevelID: "invalid" },
      "malformed",
    ]), { status: 200 })));

    const response = await GET();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("public, s-maxage=600, stale-while-revalidate=300");
    await expect(response.json()).resolves.toMatchObject({
      count: 1,
      warnings: [{ area: "LSB", level: "orange", areaName: "Lisboa" }],
      dataState: { state: "healthy", source: "ipma-warnings" },
    });
  });

  it("returns a cacheable empty state for a valid empty provider array", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("[]", { status: 200 })));

    const response = await GET();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("s-maxage=600");
    await expect(response.json()).resolves.toMatchObject({ count: 0, warnings: [], dataState: { state: "empty" } });
  });

  it("accepts IPMA local ISO timestamps without a timezone suffix", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify([{
      ...validWarning,
      startTime: "2026-07-12T10:00:00",
      endTime: "2026-07-12T20:00:00",
    }]), { status: 200 })));

    const response = await GET();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      count: 1,
      warnings: [{ startTime: "2026-07-12T10:00:00", endTime: "2026-07-12T20:00:00" }],
      dataState: { state: "healthy" },
    });
  });

  it("fails closed when IPMA returns a malformed top-level payload", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ warnings: [validWarning] }), { status: 200 })));

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(502);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(body.error).toBe("Weather warnings are temporarily unavailable.");
    expect(body.dataState).toMatchObject({ state: "retryable-error" });
  });

  it("drops warning rows with invalid required fields while preserving valid rows", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify([
      { ...validWarning, awarenessLevelID: "red" },
      { ...validWarning, startTime: "not-a-date" },
      { ...validWarning, endTime: "not-a-date" },
      { ...validWarning, startTime: "1" },
      { ...validWarning, endTime: "2026-02-30T10:00:00Z" },
      { ...validWarning, idAreaAviso: "   " },
      { ...validWarning, text: 42 },
    ]), { status: 200 })));

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      count: 1,
      warnings: [{ area: "LSB", level: "red", text: "Wind" }],
      dataState: { state: "healthy" },
    });
  });

  it("fails closed when every recognized warning row is malformed", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify([
      { ...validWarning, idAreaAviso: "   " },
      { ...validWarning, startTime: "2026-02-30T10:00:00Z" },
    ]), { status: 200 })));

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(502);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(body.dataState).toMatchObject({ state: "retryable-error" });
  });

  it("redacts non-OK upstream responses and prevents caching", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("provider-secret", { status: 503 })));

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(502);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(body.error).toBe("Weather warnings are temporarily unavailable.");
    expect(JSON.stringify(body)).not.toContain("provider-secret");
  });

  it("redacts rejected upstream responses and cache-loader failures", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("token=private")));

    const rejected = await GET();
    const rejectedBody = await rejected.json();
    expect(rejected.status).toBe(502);
    expect(JSON.stringify(rejectedBody)).not.toContain("token=private");

    cached.mockRejectedValueOnce(new Error("private warnings cache detail"));
    const cachedFailure = await GET();
    const cachedFailureBody = await cachedFailure.json();
    expect(cachedFailure.status).toBe(502);
    expect(cachedFailure.headers.get("cache-control")).toBe("no-store");
    expect(JSON.stringify(cachedFailureBody)).not.toContain("private warnings cache detail");
  });
});
