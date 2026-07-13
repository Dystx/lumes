import { describe, expect, it } from "vitest";
import {
  adaptHistoryToIncident,
  filterHistoryIncidents,
  normalizeHistoryIncident,
  normalizeHistoryResponse,
  transformHistoryResponse,
} from "@/lib/history-view";
import type { HistoryIncident } from "@/lib/types";

const incident = (overrides: Partial<HistoryIncident>): HistoryIncident => ({
  id: "1",
  sourceId: "anepc",
  sourceInternalId: "1",
  displayName: "Incêndio de teste",
  eventType: "wildfire",
  status: "resolved",
  severity: "high",
  latitude: 38.7,
  longitude: -9.1,
  estimatedAreaHa: 1,
  municipality: "Lisboa",
  parish: "Santa Maria Maior",
  district: "Lisboa",
  personnelTotal: 0,
  assetsGround: 0,
  assetsAerial: 0,
  confidence: 1,
  rasi: null,
  naturezaText: null,
  statusText: null,
  firstSeen: "2026-07-12T10:00:00.000Z",
  lastSeen: "2026-07-12T10:30:00.000Z",
  firstDetected: "2026-07-12T10:00:00.000Z",
  lastUpdated: "2026-07-12T10:30:00.000Z",
  createdAt: "2026-07-12T10:00:00.000Z",
  updatedAt: "2026-07-12T10:30:00.000Z",
  ...overrides,
});

function validHistoryIncident(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    ...incident({}),
    ...overrides,
  };
}

function validHistoryResponse(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    count: 1,
    total: 1,
    incidents: [validHistoryIncident()],
    fetchedAt: "2026-07-13T10:01:00.000Z",
    ...overrides,
  };
}

describe("history view filtering", () => {
  const incidents = [
    incident({ id: "lisbon", displayName: "Incêndio no centro" }),
    incident({ id: "porto", displayName: "Ocorrência norte", municipality: "Porto", district: "Porto" }),
  ];

  it("returns the complete list for an empty search", () => {
    expect(filterHistoryIncidents(incidents, "")).toEqual(incidents);
    expect(filterHistoryIncidents(incidents, "  ")).toEqual(incidents);
  });

  it("matches display name, municipality, and district case-insensitively", () => {
    expect(filterHistoryIncidents(incidents, "CENTRO").map(({ id }) => id)).toEqual(["lisbon"]);
    expect(filterHistoryIncidents(incidents, "porto").map(({ id }) => id)).toEqual(["porto"]);
    expect(filterHistoryIncidents(incidents, "NORTE").map(({ id }) => id)).toEqual(["porto"]);
  });

  it("does not match a missing locality field", () => {
    const noLocality = incident({ id: "no-locality", municipality: null, district: null });
    expect(filterHistoryIncidents([noLocality], "lisboa")).toEqual([]);
  });
});

describe("history client boundary", () => {
  it("normalizes a valid history row and response envelope", () => {
    const row = normalizeHistoryIncident(validHistoryIncident());
    const response = normalizeHistoryResponse(validHistoryResponse());

    expect(row).toMatchObject({ id: "1", latitude: 38.7, longitude: -9.1 });
    expect(response).toMatchObject({ count: 1, total: 1, fetchedAt: "2026-07-13T10:01:00.000Z" });
    expect(response?.incidents).toHaveLength(1);
  });

  it("keeps valid rows from a mixed response", () => {
    const response = normalizeHistoryResponse(validHistoryResponse({
      count: 1,
      total: 2,
      incidents: [
        validHistoryIncident(),
        validHistoryIncident({ id: "bad", latitude: 0, longitude: 0 }),
      ],
    }));

    expect(response?.incidents.map(({ id }) => id)).toEqual(["1"]);
  });

  it("preserves an explicit empty response", () => {
    expect(normalizeHistoryResponse({
      count: 0,
      total: 0,
      incidents: [],
      fetchedAt: "2026-07-13T10:01:00.000Z",
    })).toEqual({
      count: 0,
      total: 0,
      incidents: [],
      fetchedAt: "2026-07-13T10:01:00.000Z",
    });
  });

  it.each([
    ["missing envelope incidents", { incidents: undefined }],
    ["non-array envelope incidents", { incidents: "bad", count: 0, total: 0 }],
    ["invalid count", { incidents: [], count: -1, total: 0 }],
    ["count mismatch", { incidents: [], count: 1, total: 1 }],
    ["total below count", { incidents: [validHistoryIncident()], count: 1, total: 0 }],
    ["invalid fetchedAt", { incidents: [], count: 0, total: 0, fetchedAt: "not-a-date" }],
  ])("rejects envelopes with %s", (_label, overrides) => {
    expect(normalizeHistoryResponse({ ...validHistoryResponse(), ...overrides })).toBeNull();
  });

  it.each([
    ["foreign coordinates", { latitude: 48.86, longitude: 2.35 }],
    ["negative area", { estimatedAreaHa: -1 }],
    ["fractional personnel", { personnelTotal: 1.5 }],
    ["invalid confidence", { confidence: 2 }],
    ["unknown event type", { eventType: "fire" }],
    ["unknown status", { status: "unknown" }],
    ["unknown severity", { severity: "urgent" }],
    ["invalid optional locality", { municipality: 42 }],
    ["invalid timestamp", { firstDetected: "2026-02-30T10:00:00.000Z" }],
    ["missing identifier", { id: "" }],
  ])("rejects history rows with %s", (_label, overrides) => {
    expect(normalizeHistoryIncident(validHistoryIncident(overrides))).toBeNull();
  });

  it("turns an all-invalid non-empty response into a transform failure", () => {
    const response = validHistoryResponse({
      count: 1,
      incidents: [validHistoryIncident({ latitude: 0, longitude: 0 })],
    });

    expect(normalizeHistoryResponse(response)).toBeNull();
    expect(() => transformHistoryResponse(response)).toThrow("Invalid history response envelope");
  });

  it("adapts validated history rows into selectable detail records", () => {
    const normalized = normalizeHistoryIncident(validHistoryIncident());
    expect(normalized).not.toBeNull();
    const adapted = adaptHistoryToIncident(normalized!);

    expect(adapted).toMatchObject({
      id: "1",
      isLive: false,
      latitude: 38.7,
      longitude: -9.1,
      sourceTypes: ["official"],
      properties: { riskAvailable: false },
      timeline: [{ sourceType: "official", timestamp: "2026-07-12T10:00:00.000Z" }],
    });
  });
});
