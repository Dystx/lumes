import { describe, expect, it } from "vitest";
import {
  normalizeIncidentTimelineResponse,
  transformIncidentTimelineResponse,
} from "@/lib/incident-timeline-client";

const timestamp = "2026-07-13T10:00:00.000Z";

const snapshot = {
  id: "snapshot-1",
  timestamp,
  status: "active",
  severity: "high",
  personnelTotal: 6,
  assetsGround: 2,
  assetsAerial: 1,
  estimatedAreaHa: 3.5,
  statusText: "Em curso",
  note: "Estado alterado",
};

describe("incident timeline client boundary", () => {
  it("normalizes a valid timeline envelope for the requested incident", () => {
    expect(normalizeIncidentTimelineResponse({
      incidentId: "incident-1",
      count: 1,
      snapshots: [snapshot],
      dataState: { state: "healthy", updatedAt: timestamp },
    }, "incident-1")).toEqual({
      incidentId: "incident-1",
      count: 1,
      snapshots: [snapshot],
      dataState: { state: "healthy", updatedAt: timestamp },
    });
  });

  it("preserves a true empty response without requiring optional metadata", () => {
    expect(normalizeIncidentTimelineResponse({
      incidentId: "incident-1",
      count: 0,
      snapshots: [],
    }, "incident-1")).toEqual({
      incidentId: "incident-1",
      count: 0,
      snapshots: [],
    });
  });

  it("keeps valid mixed rows when the declared count matches them", () => {
    expect(normalizeIncidentTimelineResponse({
      incidentId: "incident-1",
      count: 1,
      snapshots: [snapshot, { ...snapshot, id: "bad", timestamp: "not-a-date" }],
    }, "incident-1")).toMatchObject({
      count: 1,
      snapshots: [snapshot],
    });
  });

  it("rejects identity, count, duplicate, and data-state drift", () => {
    expect(normalizeIncidentTimelineResponse({
      incidentId: "incident-2", count: 1, snapshots: [snapshot],
    }, "incident-1")).toBeNull();
    expect(normalizeIncidentTimelineResponse({
      incidentId: "incident-1", count: 2, snapshots: [snapshot],
    }, "incident-1")).toBeNull();
    expect(normalizeIncidentTimelineResponse({
      incidentId: "incident-1", count: 2, snapshots: [snapshot, snapshot],
    }, "incident-1")).toBeNull();
    expect(normalizeIncidentTimelineResponse({
      incidentId: "incident-1", count: 1, snapshots: [snapshot],
      dataState: { state: "empty", updatedAt: timestamp },
    }, "incident-1")).toBeNull();
  });

  it("turns malformed successful payloads into a stable transform error", () => {
    expect(() => transformIncidentTimelineResponse("incident-1")({
      incidentId: "incident-1",
      count: 1,
      snapshots: [{ ...snapshot, personnelTotal: -1 }],
    })).toThrow("Invalid incident timeline response envelope");
  });
});
