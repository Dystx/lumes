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
    await expect(response.json()).resolves.toMatchObject({
      source: "anepc-prociv-arcgis-db",
      dataState: { state: "fallback" },
    });
  });
});
