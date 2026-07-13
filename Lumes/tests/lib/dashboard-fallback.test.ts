import { beforeEach, describe, expect, it, vi } from "vitest";
import { invalidate } from "@/lib/api/cache";

const { db } = vi.hoisted(() => ({ db: {
  incident: { findMany: vi.fn(), count: vi.fn() },
  incidentSnapshot: { count: vi.fn() },
} }));

vi.mock("@/lib/db", () => ({ db }));

import { GET } from "@/app/api/dashboard/route";

describe("dashboard fallback contract", () => {
  beforeEach(() => {
    invalidate();
    vi.clearAllMocks();
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("live source unavailable")));
    db.incident.findMany.mockResolvedValue([{
      id: "incident-1", severity: "high", status: "active", municipality: "Lisboa", district: "Lisboa", parish: null,
      estimatedAreaHa: 2, personnelTotal: 4, assetsGround: 1, assetsAerial: 0, statusText: "Em curso", naturezaText: "Incêndio", rasi: null,
      firstDetected: new Date("2026-07-09T12:00:00Z"), lastSeen: new Date(), displayName: "Lisboa", latitude: 38.72, longitude: -9.14,
    }]);
    db.incident.count.mockResolvedValue(1);
    db.incidentSnapshot.count.mockResolvedValue(0);
  });

  it("labels database-backed aggregates as fallback when the live source fails", async () => {
    const response = await GET();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("public, s-maxage=30, stale-while-revalidate=120");
    await expect(response.json()).resolves.toMatchObject({
      source: "anepc-prociv-arcgis-db",
      dataState: { state: "fallback" },
    });
  });

  it("falls back when the live response contains no valid incident records", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      incidents: [{ id: 42, severity: null, properties: "malformed" }],
    }), { status: 200 })));

    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      source: "anepc-prociv-arcgis-db",
      dataState: { state: "fallback" },
      summary: { total: 1, activeCount: 1 },
    });
  });

  it("returns an explicit empty state when live and database sources are empty", async () => {
    db.incident.findMany.mockResolvedValue([]);

    const response = await GET();
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      source: "anepc-prociv-arcgis-db",
      dataState: { state: "empty" },
      summary: { total: 0, activeCount: 0, criticalCount: 0, highCount: 0 },
      topPriority: [],
    });
  });

  it("keeps the core dashboard healthy when optional persistence counts fail", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      incidents: [{
        id: "live-1", displayName: "Lisboa", severity: "high", incidentStatus: "active",
        estimatedAreaHa: 2, properties: { personnelTotal: 4, assetsGround: 1, assetsAerial: 0 },
      }],
    }), { status: 200 })));
    db.incident.count.mockRejectedValue(new Error("private persistence count detail"));
    db.incidentSnapshot.count.mockRejectedValue(new Error("private snapshot detail"));

    const response = await GET();
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      source: "anepc-prociv-arcgis-live",
      dataState: { state: "healthy" },
      summary: { total: 1, activeCount: 1 },
      persistence: null,
    });
    expect(JSON.stringify(payload)).not.toContain("private persistence count detail");
  });

  it("omits invalid live coordinates from dashboard priority output", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      incidents: [{
        id: "live-invalid-coordinate",
        displayName: "Invalid coordinate",
        severity: "high",
        incidentStatus: "active",
        geometry: { type: "Point", coordinates: [0, 0] },
        properties: { latitude: 0, longitude: 0 },
      }],
    }), { status: 200 })));

    const response = await GET();
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.topPriority).toMatchObject([{
      id: "live-invalid-coordinate",
      latitude: null,
      longitude: null,
    }]);
  });

  it("omits invalid DB coordinates from fallback priority output", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("live source unavailable")));
    db.incident.findMany.mockResolvedValue([{
      id: "db-invalid-coordinate",
      severity: "high",
      status: "active",
      municipality: "Lisboa",
      district: "Lisboa",
      parish: null,
      estimatedAreaHa: 2,
      personnelTotal: 4,
      assetsGround: 1,
      assetsAerial: 0,
      statusText: "Em curso",
      naturezaText: "Incêndio",
      rasi: null,
      firstDetected: new Date("2026-07-09T12:00:00Z"),
      lastSeen: new Date(),
      displayName: "Invalid coordinate",
      latitude: 0,
      longitude: 0,
    }]);

    const response = await GET();
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.topPriority).toMatchObject([{
      id: "db-invalid-coordinate",
      latitude: null,
      longitude: null,
    }]);
  });

  it("keeps valid live rows while rejecting invalid dashboard semantics", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      incidents: [
        {
          id: "live-valid",
          displayName: "Lisboa",
          severity: "high",
          incidentStatus: "active",
          estimatedAreaHa: 2,
          firstDetected: "2026-07-12T10:00:00.000Z",
          properties: { personnelTotal: 4, assetsGround: 1, assetsAerial: 0 },
        },
        {
          id: "live-invalid-semantics",
          displayName: "Invalid",
          severity: "unknown",
          incidentStatus: "not-a-status",
          estimatedAreaHa: -10,
          firstDetected: "not-a-date",
          properties: { personnelTotal: -4, assetsGround: "Infinity", assetsAerial: 0.5 },
        },
        {
          id: "live-status-mismatch",
          severity: "medium",
          status: "active",
          incidentStatus: "resolved",
          properties: { personnelTotal: 2, assetsGround: 0, assetsAerial: 0 },
        },
      ],
    }), { status: 200 })));

    const response = await GET();
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      source: "anepc-prociv-arcgis-live",
      dataState: { state: "healthy" },
      summary: { total: 1, activeCount: 1, personnel: 4, engines: 1, areaHa: 2 },
      topPriority: [{ id: "live-valid" }],
    });
  });

  it("falls back to the database when every live row fails semantic validation", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      incidents: [{
        id: "live-invalid",
        severity: "unknown",
        incidentStatus: "not-a-status",
        estimatedAreaHa: -1,
        firstDetected: "2026-02-30T10:00:00Z",
        properties: { personnelTotal: -1, assetsGround: 0, assetsAerial: 0 },
      }],
    }), { status: 200 })));

    const response = await GET();
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      source: "anepc-prociv-arcgis-db",
      dataState: { state: "fallback" },
      summary: { total: 1, activeCount: 1 },
      topPriority: [{ id: "incident-1" }],
    });
  });

  it("does not treat a retryable live envelope as healthy data", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      incidents: [{
        id: "live-retryable",
        severity: "high",
        incidentStatus: "active",
        properties: { personnelTotal: 4, assetsGround: 1, assetsAerial: 0 },
      }],
      dataState: { state: "retryable-error" },
    }), { status: 200 })));

    const response = await GET();
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({ source: "anepc-prociv-arcgis-db", dataState: { state: "fallback" } });
  });

  it("rejects declared non-Point live geometries instead of relabeling them", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      incidents: [{
        id: "live-line-string",
        severity: "high",
        incidentStatus: "active",
        geometry: { type: "LineString", coordinates: [-9.14, 38.72] },
        properties: { personnelTotal: 4, assetsGround: 1, assetsAerial: 0 },
      }],
    }), { status: 200 })));

    const response = await GET();
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({ source: "anepc-prociv-arcgis-db", dataState: { state: "fallback" } });
  });

  it("rejects invalid semantic values from database fallback rows", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("live source unavailable")));
    db.incident.findMany.mockResolvedValue([{
      id: "db-invalid-semantics", severity: "unknown", status: "not-a-status", municipality: "Lisboa", district: "Lisboa", parish: null,
      estimatedAreaHa: -2, personnelTotal: -4, assetsGround: 1, assetsAerial: 0,
      statusText: "Em curso", naturezaText: "Incêndio", rasi: null,
      firstDetected: new Date("2026-02-30T10:00:00Z"), lastSeen: new Date(), displayName: "Invalid", latitude: 38.72, longitude: -9.14,
    }]);

    const response = await GET();
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      source: "anepc-prociv-arcgis-db",
      dataState: { state: "empty" },
      summary: { total: 0, activeCount: 0 },
      topPriority: [],
    });
  });

  it("returns a retryable response when the database fallback itself fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("live source unavailable")));
    db.incident.findMany.mockRejectedValue(new Error("private database outage"));

    const response = await GET();
    const payload = await response.json();

    expect(response.status).toBe(500);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(payload).toMatchObject({
      error: "Dashboard data is temporarily unavailable.",
      dataState: { state: "retryable-error" },
    });
    expect(JSON.stringify(payload)).not.toContain("private database outage");
  });
});
