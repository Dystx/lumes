import { describe, expect, it } from "vitest";
import {
  DEFAULT_PORTUGAL_CAMERA,
  buildIncidentFocusCamera,
  buildPortugalOverviewCamera,
  captureCameraSnapshot,
  type CameraSnapshot,
  type CameraReader,
  type IncidentFocusTarget,
} from "@/lib/map/incident-focus-controller";

const snapshot: CameraSnapshot = {
  center: [-8.2, 39.4],
  zoom: 7.25,
  bearing: 18,
  pitch: 0,
  padding: { top: 12, right: 24, bottom: 36, left: 48 },
};

const target: IncidentFocusTarget = {
  incidentId: "incident-1",
  center: [-7.8, 40.1],
};

describe("incident focus camera policy", () => {
  it("captures the complete pre-focus camera state", () => {
    const reader: CameraReader = {
      getCenter: () => snapshot.center,
      getZoom: () => snapshot.zoom,
      getBearing: () => snapshot.bearing,
      getPitch: () => snapshot.pitch,
      getPadding: () => snapshot.padding,
    };

    expect(captureCameraSnapshot(reader)).toEqual(snapshot);
  });

  it("builds a bounded local focus camera without changing bearing", () => {
    const camera = buildIncidentFocusCamera(snapshot, target);

    expect(camera.center).toEqual(target.center);
    expect(camera.bearing).toBe(snapshot.bearing);
    expect(camera.zoom).toBeGreaterThanOrEqual(9);
    expect(camera.zoom).toBeLessThanOrEqual(13);
    expect(camera.pitch).toBe(45);
  });

  it("uses an explicit safe inset while preserving the saved camera for exit", () => {
    const padding = { top: 80, right: 420, bottom: 24, left: 32 };
    const camera = buildIncidentFocusCamera(snapshot, { ...target, padding });

    expect(camera.padding).toEqual(padding);
    expect(snapshot.padding).toEqual({ top: 12, right: 24, bottom: 36, left: 48 });
  });

  it("clamps extreme target requests to safe phase-one limits", () => {
    const camera = buildIncidentFocusCamera(snapshot, target, {
      targetZoom: 30,
      targetPitch: 90,
    });

    expect(camera.zoom).toBe(13);
    expect(camera.pitch).toBe(55);
  });

  it("builds the documented Portugal overview reset camera", () => {
    expect(buildPortugalOverviewCamera()).toEqual(DEFAULT_PORTUGAL_CAMERA);
  });
});
