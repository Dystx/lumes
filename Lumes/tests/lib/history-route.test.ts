import { beforeEach, describe, expect, it, vi } from "vitest";

const { findMany, count } = vi.hoisted(() => ({
  findMany: vi.fn(),
  count: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: { incident: { findMany, count } },
}));

import { GET } from "@/app/api/history/route";
import { NextRequest } from "next/server";

describe("history route contract", () => {
  beforeEach(() => vi.clearAllMocks());

  it("serializes persisted dates into the explicit history DTO", async () => {
    const date = new Date("2026-07-12T10:00:00.000Z");
    findMany.mockResolvedValue([{
      id: "incident-1",
      sourceId: "anepc",
      sourceInternalId: "1",
      displayName: "Serra",
      eventType: "wildfire",
      status: "resolved",
      severity: "high",
      latitude: 39,
      longitude: -8,
      estimatedAreaHa: 4,
      municipality: "Coimbra",
      parish: "Sé Nova",
      district: "Coimbra",
      personnelTotal: 5,
      assetsGround: 2,
      assetsAerial: 0,
      confidence: 0.9,
      rasi: null,
      naturezaText: "Incêndio",
      statusText: "Resolvido",
      firstSeen: date,
      lastSeen: date,
      firstDetected: date,
      lastUpdated: date,
      createdAt: date,
      updatedAt: date,
    }]);
    count.mockResolvedValue(1);

    const response = await GET(new NextRequest("http://localhost/api/history"));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({
      count: 1,
      total: 1,
      dataState: { state: "healthy", source: "incident-history" },
      incidents: [{ id: "incident-1", firstDetected: date.toISOString() }],
    });
  });

  it("redacts persistence failures and prevents caching", async () => {
    findMany.mockRejectedValue(new Error("private history database detail"));
    count.mockRejectedValue(new Error("private history count detail"));

    const response = await GET(new NextRequest("http://localhost/api/history"));
    const payload = await response.json();

    expect(response.status).toBe(502);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(payload).toMatchObject({
      count: 0,
      total: 0,
      incidents: [],
      dataState: { state: "retryable-error" },
    });
    expect(JSON.stringify(payload)).not.toContain("private history database detail");
  });
});
