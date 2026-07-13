import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { db, getPersistenceStats, cached } = vi.hoisted(() => ({
  db: {
    communityReport: { findMany: vi.fn() },
    incident: { findMany: vi.fn(), count: vi.fn() },
  },
  getPersistenceStats: vi.fn(),
  cached: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/lib/persistence", () => ({ getPersistenceStats }));
vi.mock("@/lib/api/cache", () => ({ cached }));

import { GET as aerialGet } from "@/app/api/aerial/route";
import { GET as alertsGet } from "@/app/api/alerts/route";
import { GET as followGet } from "@/app/api/follow/route";
import { GET as historyGet } from "@/app/api/history/route";
import { GET as biomassGridGet } from "@/app/api/biomass/grid/route";
import { GET as biomassGet } from "@/app/api/biomass/route";
import { GET as municipalitiesGet } from "@/app/api/municipalities/route";
import { GET as regionGet } from "@/app/api/region/[name]/route";
import { GET as reportsGet } from "@/app/api/reports/route";
import { GET as statsGet } from "@/app/api/stats/route";

describe("bounded public API contract matrix", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cached.mockImplementation(async (_key: string, _ttl: number, loader: () => Promise<unknown>) => loader());
    db.communityReport.findMany.mockResolvedValue([]);
    db.incident.findMany.mockResolvedValue([]);
    db.incident.count.mockResolvedValue(0);
  });

  it("returns an explicit empty, cacheable reports envelope", async () => {
    const response = await reportsGet(new NextRequest("http://localhost/api/reports"));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("s-maxage=30");
    expect(payload).toMatchObject({
      source: "community-reports",
      count: 0,
      reports: [],
      dataState: { state: "empty" },
    });
  });

  it("projects only reviewed reports and clamps an oversized public limit", async () => {
    db.communityReport.findMany.mockResolvedValue([{
      id: "public-report-1",
      reportType: "smoke",
      latitude: 38.72,
      longitude: -9.14,
      description: "Smoke visible from the road",
      confidence: 0.8,
      submittedAt: new Date("2026-07-12T12:00:00.000Z"),
      status: "verified",
      reporterName: "private reporter",
      reporterTier: "trusted",
      moderationNotes: "private moderation detail",
    }]);

    const response = await reportsGet(new NextRequest("http://localhost/api/reports?limit=999"));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("s-maxage=30");
    expect(payload).toMatchObject({
      source: "community-reports",
      count: 1,
      reports: [{
        id: "public-report-1",
        reportType: "smoke",
        latitude: 38.72,
        longitude: -9.14,
        submittedAt: "2026-07-12T12:00:00.000Z",
        status: "verified",
      }],
      dataState: { state: "healthy" },
    });
    expect(JSON.stringify(payload)).not.toContain("private reporter");
    expect(JSON.stringify(payload)).not.toContain("private moderation detail");
    expect(db.communityReport.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { status: "verified" },
      take: 100,
      select: expect.objectContaining({ id: true, status: true }),
    }));
  });

  it("returns a redacted, non-cacheable report-storage failure", async () => {
    db.communityReport.findMany.mockRejectedValue(new Error("private report storage detail"));

    const response = await reportsGet(new NextRequest("http://localhost/api/reports"));
    const payload = await response.json();

    expect(response.status).toBe(500);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(payload).toMatchObject({
      count: 0,
      reports: [],
      dataState: { state: "retryable-error" },
    });
    expect(JSON.stringify(payload)).not.toContain("private report storage detail");
  });

  it("serializes empty history with a stable wire shape", async () => {
    const response = await historyGet(new NextRequest("http://localhost/api/history?limit=10"));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("s-maxage=300");
    expect(payload).toMatchObject({ count: 0, total: 0, incidents: [], dataState: { state: "empty" } });
  });

  it("returns an explicit empty, cacheable municipality envelope", async () => {
    const response = await municipalitiesGet();
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("s-maxage=120");
    expect(payload).toMatchObject({
      source: "lumes-internal",
      count: 0,
      municipalities: [],
      dataState: { state: "empty" },
    });
  });

  it("aggregates populated municipalities by activity and worst severity", async () => {
    db.incident.findMany.mockResolvedValue([
      {
        id: "lisbon-active",
        municipality: "Lisboa",
        district: "Lisboa",
        status: "active",
        severity: "medium",
        lastUpdated: new Date("2026-07-12T12:00:00.000Z"),
      },
      {
        id: "lisbon-critical",
        municipality: "Lisboa",
        district: "Lisboa",
        status: "resolved",
        severity: "critical",
        lastUpdated: new Date("2026-07-12T11:00:00.000Z"),
      },
      {
        id: "porto-low",
        municipality: "Porto",
        district: "Porto",
        status: "resolved",
        severity: "low",
        lastUpdated: new Date("2026-07-11T12:00:00.000Z"),
      },
    ]);

    const response = await municipalitiesGet();
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      source: "lumes-internal",
      count: 2,
      municipalities: [
        {
          municipality: "Lisboa",
          district: "Lisboa",
          active: 1,
          total: 2,
          worstSeverity: "critical",
          lastUpdate: "2026-07-12T12:00:00.000Z",
        },
        {
          municipality: "Porto",
          district: "Porto",
          active: 0,
          total: 1,
          worstSeverity: "low",
          lastUpdate: "2026-07-11T12:00:00.000Z",
        },
      ],
      dataState: { state: "healthy" },
    });
  });

  it("returns a redacted, non-cacheable municipality failure", async () => {
    db.incident.findMany.mockRejectedValue(new Error("private persistence detail"));
    const response = await municipalitiesGet();
    const payload = await response.json();

    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(payload).toMatchObject({
      municipalities: [],
      dataState: { state: "retryable-error" },
    });
    expect(JSON.stringify(payload)).not.toContain("private persistence detail");
  });

  it("returns an explicit empty, cacheable region envelope", async () => {
    const response = await regionGet(
      new NextRequest("http://localhost/api/region/Lisboa"),
      { params: Promise.resolve({ name: "Lisboa" }) },
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("s-maxage=30");
    expect(payload).toMatchObject({
      region: "Lisboa",
      count: 0,
      incidents: [],
      dataState: { state: "empty" },
    });
  });

  it("returns a healthy populated region and keeps the active-status filter", async () => {
    const incident = {
      id: "region-incident-1",
      displayName: "Serra de Lisboa",
      municipality: "Lisboa",
      district: "Lisboa",
      status: "active",
      lastUpdated: new Date("2026-07-12T12:00:00.000Z"),
    };
    db.incident.findMany.mockResolvedValue([incident]);

    const response = await regionGet(
      new NextRequest("http://localhost/api/region/Lisboa"),
      { params: Promise.resolve({ name: "Lisboa" }) },
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      region: "Lisboa",
      count: 1,
      incidents: [expect.objectContaining({
        id: incident.id,
        displayName: incident.displayName,
        lastUpdated: "2026-07-12T12:00:00.000Z",
      })],
      includeResolved: false,
      dataState: { state: "healthy", source: "lumes-internal" },
    });
    expect(db.incident.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ status: { in: ["detected", "active", "contained", "monitoring"] } }),
    }));
  });

  it("removes the active-status filter only for an explicit resolved query", async () => {
    db.incident.findMany.mockResolvedValue([{ id: "resolved-1", status: "resolved" }]);

    const response = await regionGet(
      new NextRequest("http://localhost/api/region/Lisboa?resolved=1"),
      { params: Promise.resolve({ name: "Lisboa" }) },
    );
    const payload = await response.json();
    const query = db.incident.findMany.mock.calls.at(-1)?.[0] as { where?: Record<string, unknown> };

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({ includeResolved: true, dataState: { state: "healthy" } });
    expect(query.where).not.toHaveProperty("status");
  });

  it("rejects a blank region name before touching persistence", async () => {
    const response = await regionGet(
      new NextRequest("http://localhost/api/region/%20%20"),
      { params: Promise.resolve({ name: "  " }) },
    );

    expect(response.status).toBe(400);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(db.incident.findMany).not.toHaveBeenCalled();
  });

  it("redacts region persistence failures and prevents caching", async () => {
    db.incident.findMany.mockRejectedValue(new Error("private region persistence detail"));
    const response = await regionGet(
      new NextRequest("http://localhost/api/region/Lisboa"),
      { params: Promise.resolve({ name: "Lisboa" }) },
    );
    const payload = await response.json();

    expect(response.status).toBe(502);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(payload).toMatchObject({
      region: "Lisboa",
      dataState: { state: "retryable-error" },
    });
    expect(JSON.stringify(payload)).not.toContain("private region persistence detail");
  });

  it("returns redacted retryable stats when persistence fails", async () => {
    getPersistenceStats.mockRejectedValue(new Error("private persistence detail"));
    const response = await statsGet();
    const payload = await response.json();

    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(payload).toMatchObject({ dataState: { state: "retryable-error" } });
    expect(JSON.stringify(payload)).not.toContain("private persistence detail");
  });

  it("fails closed for shared alerts and follows", async () => {
    const [alerts, follows] = await Promise.all([alertsGet(), followGet()]);
    expect(alerts.status).toBe(503);
    expect(follows.status).toBe(503);
    expect(alerts.headers.get("cache-control")).toBe("no-store");
    expect(follows.headers.get("cache-control")).toBe("no-store");
    await expect(alerts.json()).resolves.toMatchObject({ dataState: { state: "retryable-error" } });
    await expect(follows.json()).resolves.toMatchObject({ dataState: { state: "retryable-error" } });
  });

  it("does not cache malformed aerial requests", async () => {
    const response = await aerialGet(new NextRequest("http://localhost/api/aerial?bbox=not-a-bbox"));
    expect(response.status).toBe(400);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("rejects malformed biomass grid bounds instead of widening to the default grid", async () => {
    const response = await biomassGridGet(new NextRequest("http://localhost/api/biomass/grid?bbox=not-a-bbox"));
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(payload).toMatchObject({ dataState: { state: "empty" } });
  });

  it("rejects biomass points outside Portugal before grid work", async () => {
    const response = await biomassGet(new NextRequest("http://localhost/api/biomass?lat=0&lon=0"));
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(payload).toMatchObject({ dataState: { state: "empty" } });
  });

  it("returns healthy biomass data with a cacheable state envelope", async () => {
    const response = await biomassGet(new NextRequest("http://localhost/api/biomass?lat=38.72&lon=-9.14"));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("s-maxage=86400");
    expect(payload).toMatchObject({ source: expect.stringContaining("synthetic"), dataState: { state: "healthy" } });
  });

  it("returns a redacted, non-cacheable biomass failure", async () => {
    cached.mockRejectedValueOnce(new Error("private biomass persistence detail"));
    const response = await biomassGet(new NextRequest("http://localhost/api/biomass?lat=38.72&lon=-9.14"));
    const payload = await response.json();

    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(payload).toMatchObject({ dataState: { state: "retryable-error" } });
    expect(JSON.stringify(payload)).not.toContain("private biomass persistence detail");
  });

  it("does not cache malformed history bounds", async () => {
    const response = await historyGet(new NextRequest("http://localhost/api/history?offset=-1"));
    expect(response.status).toBe(400);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
});
