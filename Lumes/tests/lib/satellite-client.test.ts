import { describe, expect, it } from "vitest";
import {
  normalizeSatelliteResponse,
  transformSatelliteResponse,
} from "@/lib/satellite-client";

const fetchedAt = "2026-07-13T10:00:00Z";
const detection = {
  id: "firms-2026-07-13-1000-38.720--9.140",
  sourceId: "nasa-firms-viirs",
  observedAt: fetchedAt,
  geometry: { type: "Point", coordinates: [-9.14, 38.72] },
  properties: {
    satellite: "Suomi-NPP",
    instrument: "VIIRS",
    frp: 12.5,
    brightness: 330.4,
    confidence: 0.9,
  },
  severity: "high",
  displayName: "VIIRS — 12.5 MW",
  sourceType: "satellite",
  trust: {
    confidence: 0.9,
    sourceReputation: 0.85,
    verificationStatus: "single-source",
    corroborationCount: 0,
    freshnessScore: 0.9,
  },
  eventType: "wildfire",
  incidentStatus: "active",
  estimatedAreaHa: 0,
  firstDetected: "",
  lastUpdated: "",
};

function response(overrides: Record<string, unknown> = {}) {
  return {
    source: "nasa-firms-viirs",
    sourceType: "satellite",
    fetchedAt,
    count: 1,
    detections: [detection],
    bbox: "-9.5,36,42.2,-6",
    dayRange: 2,
    cached: false,
    dataState: { state: "healthy", updatedAt: fetchedAt, source: "nasa-firms-viirs" },
    ...overrides,
  };
}

describe("satellite client boundary", () => {
  it("accepts a healthy FIRMS detection envelope", () => {
    expect(normalizeSatelliteResponse(response())).toMatchObject({ count: 1, detections: [detection] });
  });

  it("preserves explicit empty state", () => {
    expect(normalizeSatelliteResponse(response({
      count: 0,
      detections: [],
      dataState: { state: "empty", updatedAt: fetchedAt, source: "nasa-firms-viirs" },
    }))).toMatchObject({ count: 0, detections: [] });
  });

  it("rejects wrong source, bbox, day range, and freshness metadata", () => {
    expect(normalizeSatelliteResponse(response({ source: "other" }))).toBeNull();
    expect(normalizeSatelliteResponse(response({ bbox: "not-a-bbox" }))).toBeNull();
    expect(normalizeSatelliteResponse(response({ dayRange: 0 }))).toBeNull();
    expect(normalizeSatelliteResponse(response({ fetchedAt: "not-a-date" }))).toBeNull();
  });

  it("keeps valid mixed detections when the declared count matches", () => {
    expect(normalizeSatelliteResponse(response({ detections: [detection, { ...detection, id: "bad", geometry: null }], count: 1 }))).toMatchObject({
      count: 1,
      detections: [detection],
    });
  });

  it("rejects malformed rows, duplicate IDs, and foreign coordinates", () => {
    expect(normalizeSatelliteResponse(response({ detections: [{ ...detection, properties: { ...detection.properties, frp: -1 } }] }))).toBeNull();
    expect(normalizeSatelliteResponse(response({ detections: [detection, detection], count: 2 }))).toBeNull();
    expect(normalizeSatelliteResponse(response({ detections: [{ ...detection, geometry: { type: "Point", coordinates: [0, 0] } }] }))).toBeNull();
  });

  it("rejects invalid trust metadata and optional flags", () => {
    expect(normalizeSatelliteResponse(response({ cached: "false" }))).toBeNull();
    expect(normalizeSatelliteResponse(response({ detections: [{ ...detection, trust: { ...detection.trust, confidence: 2 } }] }))).toBeNull();
    expect(normalizeSatelliteResponse(response({ detections: [{ ...detection, sourceType: "official" }] }))).toBeNull();
  });

  it("throws a stable error for malformed successful payloads", () => {
    expect(() => transformSatelliteResponse({})).toThrow("Invalid satellite response envelope");
  });
});
