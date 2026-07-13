import { describe, expect, it } from "vitest";
import { SAMPLE_INCIDENTS, type Incident } from "@/lib/sample-data";
import {
  buildCommunityGeoJSON,
  buildEvacuationGeoJSON,
  buildIncidentsGeoJSON,
  buildSatelliteGeoJSON,
  buildSelectedGeoJSON,
} from "@/lib/map/geojson-builders";

const fixture: Incident = {
  ...SAMPLE_INCIDENTS[0],
  id: "fixture-incident",
  latitude: 38.7,
  longitude: -9.1,
  estimatedAreaHa: 100,
  evacuationOrder: true,
  timeline: [
    {
      id: "satellite-event",
      timestamp: "2026-07-12T10:00:00.000Z",
      sourceType: "satellite",
      sourceName: "FIRMS",
      type: "detection",
      title: "Hotspot",
      description: "Thermal anomaly",
      confidence: 0.8,
      verification: "single-source",
    },
    {
      id: "community-event",
      timestamp: "2026-07-12T10:01:00.000Z",
      sourceType: "community",
      sourceName: "Community",
      type: "report",
      title: "Smoke visible",
      description: "Smoke visible from the road",
      confidence: 0.7,
      verification: "corroborated",
    },
  ],
};

describe("map GeoJSON builders", () => {
  it("builds one incident point with stable operational properties", () => {
    const collection = buildIncidentsGeoJSON([fixture], "dark");
    expect(collection.features).toHaveLength(1);
    expect(collection.features[0]).toMatchObject({
      geometry: { type: "Point", coordinates: [-9.1, 38.7] },
      properties: {
        id: "fixture-incident",
        severity: fixture.severity,
        status: fixture.status,
        opacity: 0.9,
        color: "#ff6b5b",
      },
    });
  });

  it("builds satellite and community event points with deterministic offsets", () => {
    const satellite = buildSatelliteGeoJSON([fixture]);
    const community = buildCommunityGeoJSON([fixture]);
    expect(satellite.features).toHaveLength(1);
    expect(community.features).toHaveLength(1);
    expect(satellite.features[0].properties).toMatchObject({ incidentId: fixture.id, sourceName: "FIRMS" });
    expect(community.features[0].properties).toMatchObject({ incidentId: fixture.id, sourceName: "Community" });
    expect(satellite.features[0].geometry).toEqual(buildSatelliteGeoJSON([fixture]).features[0].geometry);
  });

  it("builds evacuation and selected-incident polygons only when applicable", () => {
    expect(buildEvacuationGeoJSON([fixture]).features).toHaveLength(1);
    expect(buildEvacuationGeoJSON([{ ...fixture, evacuationOrder: false }]).features).toHaveLength(0);
    expect(buildSelectedGeoJSON(null).features).toHaveLength(0);
    expect(buildSelectedGeoJSON(fixture).features[0].geometry.type).toBe("Polygon");
  });
});
