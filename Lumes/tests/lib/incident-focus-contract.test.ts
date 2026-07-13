import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("incident focus map boundary", () => {
  it("exposes a controlled focus handle without enabling global rotation", () => {
    const source = readFileSync("src/components/ember-map.tsx", "utf8");

    expect(source).toContain("enterIncidentFocus");
    expect(source).toContain("exitIncidentFocus");
    expect(source).toContain("returnToPortugalOverview");
    expect(source).toContain("getCameraSnapshot");
    expect(source).toContain("isMapReady");
    expect(source).toContain("MAP_STYLE_RESTORED_EVENT");
    expect(source).toContain("dispatchMapEvent");
    expect(source).toContain('dragRotate: false');
    expect(source).toContain('touchPitch: false');
    expect(source).toContain('map.stop()');
    expect(source).not.toContain('OpenFreeMap');
    expect(source).not.toContain('fill-extrusion');
    expect(source).not.toContain("dragRotate.enable()");
    expect(source).not.toContain("touchPitch.enable()");
  });
});
