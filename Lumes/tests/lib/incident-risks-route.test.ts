import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { resetRateLimit } from "@/lib/api/rate-limit";

const { db, cached } = vi.hoisted(() => ({
  db: { incident: { findMany: vi.fn() } },
  cached: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/lib/api/cache", () => ({ cached }));

import { POST as incidentRisksPost } from "@/app/api/incidents/risks/route";

describe("incident risk batch route contract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetRateLimit();
    cached.mockImplementation(async (_key: string, _ttl: number, loader: () => Promise<unknown>) => loader());
    db.incident.findMany.mockResolvedValue([]);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns an empty no-store state without querying persistence", async () => {
    const response = await incidentRisksPost(new NextRequest("http://localhost/api/incidents/risks", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ incidentIds: [] }),
    }));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(payload).toMatchObject({ risks: {}, dataState: { state: "empty" } });
    expect(db.incident.findMany).not.toHaveBeenCalled();
  });

  it("returns healthy risk data for a Portugal incident", async () => {
    db.incident.findMany.mockResolvedValue([{ id: "incident-1", latitude: 38.72, longitude: -9.14 }]);
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      current: {
        temperature_2m: 31,
        relative_humidity_2m: 25,
        wind_speed_10m: 22,
        wind_direction_10m: 180,
        precipitation: 0,
      },
    }), { status: 200 })));

    const response = await incidentRisksPost(new NextRequest("http://localhost/api/incidents/risks", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ incidentIds: ["incident-1"] }),
    }));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("s-maxage=300");
    expect(payload).toMatchObject({
      dataState: { state: "healthy" },
      risks: { "incident-1": { dataQuality: "ok", category: expect.any(String), score: expect.any(Number) } },
    });
  });

  it("returns an explicit empty state for unknown IDs without weather work", async () => {
    db.incident.findMany.mockResolvedValue([]);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await incidentRisksPost(new NextRequest("http://localhost/api/incidents/risks", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ incidentIds: ["missing-incident"] }),
    }));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("s-maxage=300");
    expect(payload).toMatchObject({ risks: {}, dataState: { state: "empty" } });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns an explicit empty state for out-of-Portugal incidents without weather work", async () => {
    db.incident.findMany.mockResolvedValue([{ id: "outside-1", latitude: 0, longitude: 0 }]);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await incidentRisksPost(new NextRequest("http://localhost/api/incidents/risks", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ incidentIds: ["outside-1"] }),
    }));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({ risks: {}, dataState: { state: "empty" } });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("keeps valid risks when the persistence result mixes valid and invalid coordinates", async () => {
    db.incident.findMany.mockResolvedValue([
      { id: "incident-1", latitude: 38.72, longitude: -9.14 },
      { id: "outside-1", latitude: 0, longitude: 0 },
    ]);
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      current: {
        temperature_2m: 31,
        relative_humidity_2m: 25,
        wind_speed_10m: 22,
        wind_direction_10m: 180,
        precipitation: 0,
      },
    }), { status: 200 })));

    const response = await incidentRisksPost(new NextRequest("http://localhost/api/incidents/risks", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ incidentIds: ["incident-1", "outside-1"] }),
    }));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({ dataState: { state: "healthy" }, risks: { "incident-1": { dataQuality: "ok" } } });
    expect(payload.risks).not.toHaveProperty("outside-1");
  });

  it("deduplicates in-flight weather requests for same-coordinate incidents", async () => {
    db.incident.findMany.mockResolvedValue([
      { id: "incident-1", latitude: 38.72, longitude: -9.14 },
      { id: "incident-2", latitude: 38.72, longitude: -9.14 },
    ]);
    let resolveWeather: ((response: Response) => void) | undefined;
    const fetchMock = vi.fn(() => new Promise<Response>((resolve) => {
      resolveWeather = resolve;
    }));
    vi.stubGlobal("fetch", fetchMock);

    const request = incidentRisksPost(new NextRequest("http://localhost/api/incidents/risks", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ incidentIds: ["incident-1", "incident-2"] }),
    }));
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    resolveWeather?.(new Response(JSON.stringify({
      current: {
        temperature_2m: 31,
        relative_humidity_2m: 25,
        wind_speed_10m: 22,
        wind_direction_10m: 180,
        precipitation: 0,
      },
    }), { status: 200 }));

    const response = await request;
    const payload = await response.json();
    expect(response.status).toBe(200);
    expect(Object.keys(payload.risks)).toEqual(["incident-1", "incident-2"]);
  });

  it("redacts persistence failures and prevents caching", async () => {
    db.incident.findMany.mockRejectedValue(new Error("private risk persistence detail"));
    const response = await incidentRisksPost(new NextRequest("http://localhost/api/incidents/risks", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ incidentIds: ["incident-1"] }),
    }));
    const payload = await response.json();

    expect(response.status).toBe(502);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(payload).toMatchObject({ dataState: { state: "retryable-error" }, risks: {} });
    expect(JSON.stringify(payload)).not.toContain("private risk persistence detail");
  });

  it("marks malformed weather as no_weather without publishing non-finite values", async () => {
    db.incident.findMany.mockResolvedValue([{ id: "incident-1", latitude: 38.72, longitude: -9.14 }]);
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      current: {
        temperature_2m: 31,
        relative_humidity_2m: 25,
        wind_speed_10m: -1,
        wind_direction_10m: 180,
        precipitation: 0,
      },
    }), { status: 200 })));

    const response = await incidentRisksPost(new NextRequest("http://localhost/api/incidents/risks", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ incidentIds: ["incident-1"] }),
    }));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      dataState: { state: "healthy" },
      risks: {
        "incident-1": {
          dataQuality: "no_weather",
          score: 0,
          ignition: 0,
          intensity: 0,
        },
      },
    });
    expect(JSON.stringify(payload)).not.toContain("NaN");
  });
});
