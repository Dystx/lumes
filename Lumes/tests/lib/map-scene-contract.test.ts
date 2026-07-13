import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("responsive map ownership contract", () => {
  it("has one page-level map ownership path and a complete scene adapter", () => {
    const page = readFileSync("src/app/page.tsx", "utf8");
    const scene = readFileSync("src/components/map/map-scene.tsx", "utf8");
    const map = readFileSync("src/components/ember-map.tsx", "utf8");

    expect(page.match(/<EmberMap\b/g)?.length ?? 0).toBe(0);
    expect(page).toContain("<MapScene");
    expect(page).not.toContain("incidents={visibleIncidents as any[]}");
    expect(page).not.toContain("visibleSources={visibleSources as any}");
    expect(scene).toContain("extends EmberMapProps");
    expect(scene).toContain("mapProps");
    expect(scene).toContain("ResizeObserver");
    expect(map).toContain('data-map-ready={mapReady ? "true" : "false"}');
    expect(map).toContain('data-incident-source-ready={incidentDataReady ? "true" : "false"}');
    expect(map).toContain("setGeoJSONSourceData");
    expect(map).not.toContain("as maplibregl.GeoJSONSource");
  });
});
