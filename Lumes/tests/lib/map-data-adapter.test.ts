import { describe, expect, it } from "vitest";
import { toFireRiskFeatures, toFireStationFeatures, toSatelliteFeatures } from "@/components/map/map-data-adapter";

describe("map data adapter", () => {
  it("filters and normalizes fire-risk records", () => {
    expect(toFireRiskFeatures([
      { longitude: -8, latitude: 39, rcm: 1, dico: "Norte" },
      { longitude: -9, latitude: 38, rcm: 2, dico: "Centro" },
    ], 1)).toEqual([{
      type: "Feature",
      geometry: { type: "Point", coordinates: [-8, 39] },
      properties: { rcm: 1, dico: "Norte" },
    }]);
  });

  it("keeps station and satellite feature contracts explicit", () => {
    expect(toFireStationFeatures([{ id: 7, lon: -8.6, lat: 41.1, name: "Braga" }])[0].properties.id).toBe(7);
    expect(toSatelliteFeatures([{
      type: "Feature",
      geometry: { type: "Point", coordinates: [-8, 39] },
      properties: { id: "firms-1", frp: 12, confidence: 80, brightness: 330, satellite: "N", instrument: "VIIRS", observedAt: "2026-01-01T00:00:00Z" },
    }])[0].properties.id).toBe("firms-1");
    expect(toSatelliteFeatures([{
      id: "detection-1",
      sourceId: "nasa-firms-viirs",
      observedAt: "2026-01-01T00:00:00Z",
      geometry: { type: "Point", coordinates: [-8, 39] },
      properties: { satellite: "N", instrument: "VIIRS", frp: 4, brightness: 312, confidence: 0.65 },
      severity: "medium",
      displayName: "VIIRS — 4.0 MW",
    }])[0]).toMatchObject({
      type: "Feature",
      properties: { id: "detection-1", observedAt: "2026-01-01T00:00:00Z", frp: 4 },
    });
  });

  it("never emits non-Portugal or non-finite fire-risk points", () => {
    expect(toFireRiskFeatures([
      { longitude: 0, latitude: 0, rcm: 3, dico: "Null Island" },
      { longitude: Number.NaN, latitude: 38.72, rcm: 3, dico: "Bad longitude" },
      { longitude: -9.14, latitude: 38.72, rcm: 3, dico: "Lisboa" },
    ], null)).toEqual([{
      type: "Feature",
      geometry: { type: "Point", coordinates: [-9.14, 38.72] },
      properties: { rcm: 3, dico: "Lisboa" },
    }]);
  });
});
