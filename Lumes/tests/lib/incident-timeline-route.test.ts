import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { getIncidentTimeline } = vi.hoisted(() => ({ getIncidentTimeline: vi.fn() }));

vi.mock("@/lib/persistence", () => ({ getIncidentTimeline }));

import { GET } from "@/app/api/incidents/[id]/timeline/route";

describe("incident timeline route contract", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns an explicit empty state for an incident without snapshots", async () => {
    getIncidentTimeline.mockResolvedValue([]);
    const response = await GET(new NextRequest("http://localhost/api/incidents/incident-1/timeline"), {
      params: Promise.resolve({ id: "incident-1" }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("public, s-maxage=60, stale-while-revalidate=300");
    await expect(response.json()).resolves.toMatchObject({
      incidentId: "incident-1",
      count: 0,
      snapshots: [],
      dataState: { state: "empty", source: "incident-timeline" },
    });
  });

  it("serializes non-empty snapshot dates into the timeline wire response", async () => {
    const timestamp = new Date("2026-07-12T10:00:00.000Z");
    getIncidentTimeline.mockResolvedValue([{
      id: "snapshot-1",
      incidentId: "incident-1",
      timestamp,
      status: "active",
      severity: "high",
      personnelTotal: 6,
      assetsGround: 2,
      assetsAerial: 1,
      estimatedAreaHa: 3.5,
      statusText: "Em curso",
      note: "Estado alterado",
    }]);

    const response = await GET(new NextRequest("http://localhost/api/incidents/incident-1/timeline"), {
      params: Promise.resolve({ id: "incident-1" }),
    });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("public, s-maxage=60, stale-while-revalidate=300");
    expect(payload).toMatchObject({
      incidentId: "incident-1",
      count: 1,
      dataState: {
        state: "healthy",
        source: "incident-timeline",
        sourceUpdatedAt: timestamp.toISOString(),
      },
      snapshots: [{ id: "snapshot-1", timestamp: timestamp.toISOString(), personnelTotal: 6 }],
    });
  });

  it("redacts persistence details and disables caching on failure", async () => {
    getIncidentTimeline.mockRejectedValue(new Error("private database detail"));
    const response = await GET(new NextRequest("http://localhost/api/incidents/incident-1/timeline"), {
      params: Promise.resolve({ id: "incident-1" }),
    });
    const payload = await response.json();

    expect(response.status).toBe(502);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(payload).toMatchObject({ dataState: { state: "retryable-error" } });
    expect(JSON.stringify(payload)).not.toContain("private database detail");
  });
});
