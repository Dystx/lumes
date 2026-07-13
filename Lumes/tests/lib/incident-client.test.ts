import { describe, expect, it } from "vitest";
import { buildIncidentsGeoJSON } from "@/lib/map/geojson-builders";
import {
  adaptLiveIncidents,
  adaptLiveToUI,
  normalizeIncidentResponse,
  normalizeLiveIncident,
  normalizeLiveIncidents,
  transformIncidentResponse,
} from "@/lib/incident-client";

function validIncident(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "anepc-incident-1",
    sourceId: "anepc-prociv-arcgis",
    sourceInternalId: "1",
    observedAt: "2026-07-13T10:00:00.000Z",
    ingestedAt: "2026-07-13T10:01:00.000Z",
    geometry: { type: "Point", coordinates: [-8.61, 41.15] },
    sourceType: "official",
    properties: {
      numero: "2026-1",
      statusText: "Em Curso",
      statusGroup: "Em Curso",
      rasi: "Incêndios Rurais",
      naturezaText: "Incêndio rural",
      localidade: "Viseu",
      municipality: "Viseu",
      parish: "São João",
      region: "Centro",
      personnelTotal: 12,
      personnelGround: 10,
      personnelAerial: 2,
      assetsGround: 4,
      assetsAerial: 1,
      durationMinutes: 30,
    },
    trust: {
      confidence: 0.92,
      sourceReputation: 0.95,
      verificationStatus: "officially-verified",
      corroborationCount: 0,
      freshnessScore: 0.9,
    },
    eventType: "wildfire",
    incidentStatus: "active",
    severity: "high",
    displayName: "Viseu (Viseu)",
    estimatedAreaHa: 2.5,
    firstDetected: "2026-07-13T10:00:00.000Z",
    lastUpdated: "2026-07-13T10:01:00.000Z",
    ...overrides,
  };
}

function validResponse(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    source: "anepc-prociv-arcgis",
    sourceType: "official",
    fetchedAt: "2026-07-13T10:01:00.000Z",
    totalRaw: 1,
    incidents: [validIncident()],
    count: 1,
    distribution: {
      byType: { wildfire: 1 },
      byStatus: { active: 1 },
    },
    cached: false,
    latencyMs: 42,
    ...overrides,
  };
}

describe("client incident boundary", () => {
  it("normalizes a valid row and keeps the adapted GeoJSON point in Portugal", () => {
    const normalized = normalizeLiveIncident(validIncident());

    expect(normalized).not.toBeNull();
    const adapted = adaptLiveToUI(normalized!);
    const geojson = buildIncidentsGeoJSON([adapted], "dark");

    expect(geojson.features).toHaveLength(1);
    const coordinates = geojson.features[0].geometry.type === "Point"
      ? geojson.features[0].geometry.coordinates
      : [];
    expect(coordinates).toEqual([-8.61, 41.15]);
    expect(coordinates.every(Number.isFinite)).toBe(true);
  });

  it("preserves the incident source provenance in the adapted model", () => {
    const normalized = normalizeLiveIncident(validIncident({ sourceType: "weather" }));

    expect(normalized).not.toBeNull();
    expect(adaptLiveToUI(normalized!).sourceTypes).toEqual(["weather"]);
  });

  it.each([
    ["null properties", { properties: null }],
    ["missing geometry", { geometry: undefined }],
    ["null trust", { trust: null }],
  ])("rejects rows with %s", (_label, overrides) => {
    expect(normalizeLiveIncident(validIncident(overrides))).toBeNull();
  });

  it.each([
    ["foreign coordinates", { geometry: { type: "Point", coordinates: [2.35, 48.86] } }],
    ["NaN longitude", { geometry: { type: "Point", coordinates: [Number.NaN, 41.15] } }],
    ["infinite latitude", { geometry: { type: "Point", coordinates: [-8.61, Number.POSITIVE_INFINITY] } }],
    ["wrong geometry type", { geometry: { type: "Polygon", coordinates: [-8.61, 41.15] } }],
  ])("rejects rows with %s", (_label, overrides) => {
    expect(normalizeLiveIncident(validIncident(overrides))).toBeNull();
  });

  it.each([
    ["unknown source", { sourceType: "unknown" }],
    ["unknown event", { eventType: "unknown" }],
    ["unknown status", { incidentStatus: "unknown" }],
    ["unknown severity", { severity: "urgent" }],
    ["unknown verification", { trust: { ...validIncident().trust as Record<string, unknown>, verificationStatus: "unknown" } }],
    ["invalid timestamp", { observedAt: "2026-02-30T10:00:00.000Z" }],
    ["invalid scalar", { estimatedAreaHa: Number.NaN }],
    ["out-of-range trust", { trust: { ...validIncident().trust as Record<string, unknown>, confidence: 1.5 } }],
    ["invalid property scalar", { properties: { ...(validIncident().properties as Record<string, unknown>), personnelTotal: Number.POSITIVE_INFINITY } }],
  ])("rejects rows with %s", (_label, overrides) => {
    expect(normalizeLiveIncident(validIncident(overrides))).toBeNull();
  });

  it("retains valid rows when a successful payload contains malformed rows", () => {
    const rows = normalizeLiveIncidents([
      validIncident(),
      validIncident({ id: "bad-properties", properties: null }),
      validIncident({ id: "bad-coordinate", geometry: { type: "Point", coordinates: [0, 0] } }),
    ]);

    expect(rows.map((row) => row.id)).toEqual(["anepc-incident-1"]);
    expect(() => rows.map(adaptLiveToUI)).not.toThrow();
  });

  it("returns an empty collection when every row is invalid", () => {
    expect(normalizeLiveIncidents([
      validIncident({ properties: null }),
      validIncident({ trust: undefined }),
      validIncident({ geometry: { type: "Point", coordinates: [0, 0] } }),
    ])).toEqual([]);
    expect(normalizeLiveIncidents(null)).toEqual([]);
    expect(adaptLiveIncidents([
      validIncident({ properties: null }),
      validIncident({ geometry: { type: "Point", coordinates: [0, 0] } }),
    ])).toEqual([]);
  });

  it("normalizes the successful response envelope and retains valid rows plus metadata", () => {
    const normalized = normalizeIncidentResponse(validResponse());

    expect(normalized).toMatchObject({
      count: 1,
      distribution: { byType: { wildfire: 1 }, byStatus: { active: 1 } },
      cached: false,
      latencyMs: 42,
    });
    expect(normalized?.incidents.map((incident) => incident.id)).toEqual(["anepc-incident-1"]);
  });

  it("keeps valid rows when the envelope contains a malformed row", () => {
    const normalized = normalizeIncidentResponse(validResponse({
      incidents: [
        validIncident(),
        validIncident({ id: "bad", geometry: { type: "Point", coordinates: [0, 0] } }),
      ],
    }));

    expect(normalized?.incidents.map((incident) => incident.id)).toEqual(["anepc-incident-1"]);
  });

  it("keeps a true empty response explicit instead of treating it as malformed", () => {
    expect(normalizeIncidentResponse(validResponse({
      incidents: [],
      count: 0,
      totalRaw: 0,
      distribution: { byType: {}, byStatus: {} },
    }))).toEqual({
      source: "anepc-prociv-arcgis",
      sourceType: "official",
      fetchedAt: "2026-07-13T10:01:00.000Z",
      totalRaw: 0,
      incidents: [],
      count: 0,
      distribution: { byType: {}, byStatus: {} },
      cached: false,
      latencyMs: 42,
    });
  });

  it("accepts the minimal valid empty envelope when optional metadata is absent", () => {
    expect(normalizeIncidentResponse({
      source: "anepc-prociv-arcgis",
      sourceType: "official",
      fetchedAt: "2026-07-13T10:01:00.000Z",
      totalRaw: 0,
      incidents: [],
      count: 0,
    })).toEqual({
      source: "anepc-prociv-arcgis",
      sourceType: "official",
      fetchedAt: "2026-07-13T10:01:00.000Z",
      totalRaw: 0,
      incidents: [],
      count: 0,
    });
  });

  it.each([
    ["missing incidents", { incidents: undefined, count: 1 }],
    ["non-array incidents", { incidents: "not-an-array", count: 0 }],
    ["missing count", { incidents: [], count: undefined, distribution: undefined }],
    ["negative count", { incidents: [], count: -1 }],
    ["fractional count", { incidents: [], count: 1.5 }],
    ["count mismatch", { incidents: [], count: 1, totalRaw: 1, distribution: { byType: {}, byStatus: {} } }],
    ["totalRaw below count", { incidents: [validIncident()], count: 1, totalRaw: 0 }],
    ["invalid source", { incidents: [], count: 0, totalRaw: 0, source: "" }],
    ["invalid source timestamp", { incidents: [], count: 0, totalRaw: 0, fetchedAt: "not-a-date" }],
    ["invalid distribution", { incidents: [], count: 0, distribution: { byType: { wildfire: -1 }, byStatus: {} } }],
    ["distribution total mismatch", { incidents: [], count: 0, distribution: { byType: { wildfire: 1 }, byStatus: { active: 1 } } }],
    ["invalid cached flag", { incidents: [], count: 0, cached: "false" }],
    ["invalid latency", { incidents: [], count: 0, latencyMs: Number.POSITIVE_INFINITY }],
  ])("rejects envelopes with %s", (_label, overrides) => {
    expect(normalizeIncidentResponse({ ...validResponse(), ...overrides })).toBeNull();
  });

  it("rejects a non-empty envelope when every row is malformed", () => {
    const response = validResponse({
      incidents: [validIncident({ properties: null }), validIncident({ trust: null })],
      count: 2,
    });

    expect(normalizeIncidentResponse(response)).toBeNull();
    expect(() => transformIncidentResponse(response)).toThrow("Invalid incident response envelope");
  });

  it("rejects prototype-pollution keys in distribution maps", () => {
    const distribution = JSON.parse('{"byType":{"__proto__":1},"byStatus":{"active":1}}') as Record<string, unknown>;
    expect(normalizeIncidentResponse(validResponse({ distribution }))).toBeNull();
  });

  it("provides a stable transform for useFetch so malformed responses become retryable failures", () => {
    expect(transformIncidentResponse(validResponse()).incidents).toHaveLength(1);
    expect(() => transformIncidentResponse({ incidents: [], count: "0" })).toThrow();
  });
});
