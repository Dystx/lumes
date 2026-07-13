import { describe, expect, it } from "vitest";
import { SAMPLE_INCIDENTS } from "@/lib/sample-data";
import { buildDashboardMetrics } from "@/lib/dashboard-metrics";
import type { DashboardResponse } from "@/lib/types";

const serverDashboard: DashboardResponse = {
  source: "persistence",
  dataState: { state: "healthy", updatedAt: "2026-07-12T10:00:00Z" },
  fetchedAt: "2026-07-12T10:00:00Z",
  summary: {
    total: 12,
    activeCount: 7,
    criticalCount: 2,
    highCount: 3,
    personnel: 100,
    aircraft: 4,
    engines: 20,
    areaHa: 800,
  },
  distribution: {
    byType: { mato: 8, urbano: 4 },
    byStatus: { active: 7, resolved: 5 },
    byStatusGroup: { "Em curso": 7, Resolvido: 5 },
  },
  topPriority: [],
  persistence: null,
};

describe("dashboard metrics", () => {
  it("prefers server summary and distribution when available", () => {
    expect(buildDashboardMetrics(serverDashboard, [])).toEqual({
      ...serverDashboard.summary,
      byType: serverDashboard.distribution.byType,
      byStatusGroup: serverDashboard.distribution.byStatusGroup,
    });
  });

  it("computes the client fallback from visible incidents", () => {
    const incidents = [
      {
        ...SAMPLE_INCIDENTS[0],
        status: "active" as const,
        severity: "critical" as const,
        personnel: 2,
        aircraft: 1,
        engines: 3,
        estimatedAreaHa: 10,
        properties: { naturezaText: "mato", statusGroup: "Em curso" },
      },
      {
        ...SAMPLE_INCIDENTS[1],
        status: "resolved" as const,
        severity: "high" as const,
        personnel: 0,
        aircraft: 0,
        engines: 1,
        estimatedAreaHa: 4,
        properties: { rasi: "urbano", statusText: "Resolvido" },
      },
    ];

    expect(buildDashboardMetrics(null, incidents)).toEqual({
      total: 2,
      activeCount: 1,
      criticalCount: 1,
      highCount: 1,
      personnel: 2,
      aircraft: 1,
      engines: 4,
      areaHa: 14,
      byType: { mato: 1, urbano: 1 },
      byStatusGroup: { "Em curso": 1, Resolvido: 1 },
    });
  });

  it("returns zeroed metrics for an empty fallback list", () => {
    expect(buildDashboardMetrics(null, [])).toEqual({
      total: 0,
      activeCount: 0,
      criticalCount: 0,
      highCount: 0,
      personnel: 0,
      aircraft: 0,
      engines: 0,
      areaHa: 0,
      byType: {},
      byStatusGroup: {},
    });
  });
});
