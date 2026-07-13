import { describe, expect, it } from "vitest";
import { getIncidentFocusCapability } from "@/lib/map/incident-focus-capability";

const base = {
  webglSupported: true,
  mapReady: true,
  hasValidIncidentGeometry: true,
  viewportWidth: 1440,
  hardwareConcurrency: 8,
  deviceMemory: 8,
};

describe("incident focus capability policy", () => {
  it("allows camera focus on a capable device", () => {
    expect(getIncidentFocusCapability(base)).toEqual({
      allowed: true,
      mode: "full-context",
      reason: "available",
    });
  });

  it("hard-blocks focus when WebGL is unavailable", () => {
    expect(getIncidentFocusCapability({ ...base, webglSupported: false })).toEqual({
      allowed: false,
      mode: "none",
      reason: "webgl-unavailable",
    });
  });

  it("keeps camera focus available but disables heavy context on weak devices", () => {
    expect(getIncidentFocusCapability({ ...base, viewportWidth: 390, hardwareConcurrency: 2, deviceMemory: 2 })).toEqual({
      allowed: true,
      mode: "camera-only",
      reason: "low-capability",
    });
  });

  it("keeps unknown mobile hardware camera-only until capability is known", () => {
    expect(getIncidentFocusCapability({
      ...base,
      viewportWidth: 390,
      hardwareConcurrency: undefined,
      deviceMemory: undefined,
    })).toEqual({
      allowed: true,
      mode: "camera-only",
      reason: "low-capability",
    });
  });

  it("hard-blocks focus when the map or incident geometry is not ready", () => {
    expect(getIncidentFocusCapability({ ...base, mapReady: false })).toEqual({
      allowed: false,
      mode: "none",
      reason: "map-not-ready",
    });
    expect(getIncidentFocusCapability({ ...base, hasValidIncidentGeometry: false })).toEqual({
      allowed: false,
      mode: "none",
      reason: "invalid-geometry",
    });
  });
});
