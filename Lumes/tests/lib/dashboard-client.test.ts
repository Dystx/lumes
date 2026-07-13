import { describe, expect, it } from "vitest";
import { normalizeDashboardResponse, transformDashboardResponse } from "@/lib/dashboard-client";

function validPriority(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "incident-1",
    displayName: "Incêndio em Sintra",
    severity: "high",
    status: "active",
    municipality: "Sintra",
    district: "Lisboa",
    estimatedAreaHa: 2,
    personnel: 4,
    firstDetected: "2026-07-13T10:00:00.000Z",
    latitude: 38.8,
    longitude: -9.38,
    ...overrides,
  };
}

function validResponse(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    source: "anepc-prociv-arcgis-live",
    dataState: {
      state: "healthy",
      updatedAt: "2026-07-13T10:01:00.000Z",
      sourceUpdatedAt: "2026-07-13T10:00:00.000Z",
      source: "anepc-prociv-arcgis-live",
    },
    fetchedAt: "2026-07-13T10:01:00.000Z",
    summary: {
      total: 1,
      activeCount: 1,
      criticalCount: 0,
      highCount: 1,
      personnel: 4,
      aircraft: 0,
      engines: 1,
      areaHa: 2,
    },
    distribution: {
      byType: { Incêndio: 1 },
      byStatus: { active: 1 },
      byStatusGroup: { active: 1 },
    },
    topPriority: [validPriority()],
    persistence: { total: 1, active: 1, resolved: 0, snapshots: 2 },
    ...overrides,
  };
}

describe("client dashboard boundary", () => {
  it("normalizes a valid aggregate envelope and priority row", () => {
    expect(normalizeDashboardResponse(validResponse())).toMatchObject({
      source: "anepc-prociv-arcgis-live",
      summary: { total: 1, activeCount: 1 },
      topPriority: [{ id: "incident-1", severity: "high" }],
      dataState: { state: "healthy", sourceUpdatedAt: "2026-07-13T10:00:00.000Z" },
    });
  });

  it("preserves an explicit empty aggregate without fabricating priority rows", () => {
    expect(normalizeDashboardResponse(validResponse({
      source: "anepc-prociv-arcgis-db",
      dataState: {
        state: "empty",
        updatedAt: "2026-07-13T10:01:00.000Z",
        source: "anepc-prociv-arcgis-db",
      },
      summary: { total: 0, activeCount: 0, criticalCount: 0, highCount: 0, personnel: 0, aircraft: 0, engines: 0, areaHa: 0 },
      distribution: { byType: {}, byStatus: {}, byStatusGroup: {} },
      topPriority: [],
      persistence: null,
    }))).toMatchObject({
      summary: { total: 0, activeCount: 0 },
      topPriority: [],
      dataState: { state: "empty" },
    });
  });

  it("retains valid priority rows from a mixed array", () => {
    expect(normalizeDashboardResponse(validResponse({
      topPriority: [validPriority(), validPriority({ id: "bad", latitude: 0, longitude: 0 })],
    }))?.topPriority.map((priority) => priority.id)).toEqual(["incident-1"]);
  });

  it.each([
    ["missing source", { source: "" }],
    ["invalid fetched timestamp", { fetchedAt: "not-a-date" }],
    ["invalid summary count", { summary: { total: -1, activeCount: 0, criticalCount: 0, highCount: 0, personnel: 0, aircraft: 0, engines: 0, areaHa: 0 } }],
    ["invalid distribution", { distribution: { byType: { fire: 1 }, byStatus: { active: 2 }, byStatusGroup: { active: 1 } } }],
    ["invalid priority severity", { topPriority: [validPriority({ severity: "unknown" })] }],
    ["invalid priority timestamp", { topPriority: [validPriority({ firstDetected: "2026-02-30T10:00:00Z" })] }],
    ["invalid persistence", { persistence: { total: 1, active: 2, resolved: 0, snapshots: 0 } }],
    ["invalid metadata", { dataState: { state: "healthy", updatedAt: "not-a-date" } }],
  ])("rejects envelopes with %s", (_label, overrides) => {
    expect(normalizeDashboardResponse(validResponse(overrides))).toBeNull();
  });

  it("rejects duplicate priority IDs and all-invalid non-empty priority rows", () => {
    expect(normalizeDashboardResponse(validResponse({
      topPriority: [validPriority(), validPriority()],
    }))).toBeNull();

    const response = validResponse({
      topPriority: [validPriority({ latitude: 0, longitude: 0 })],
    });
    expect(normalizeDashboardResponse(response)).toBeNull();
    expect(() => transformDashboardResponse(response)).toThrow("Invalid dashboard response envelope");
  });
});
