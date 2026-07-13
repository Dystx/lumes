export type IncidentFocusMode = "overview" | "entering" | "active" | "exiting";

export interface MapPadding {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface CameraSnapshot {
  center: [number, number];
  zoom: number;
  bearing: number;
  pitch: number;
  padding: MapPadding;
}

export interface CameraReader {
  getCenter: () => [number, number];
  getZoom: () => number;
  getBearing: () => number;
  getPitch: () => number;
  getPadding: () => MapPadding;
}

export interface IncidentFocusTarget {
  incidentId: string;
  center: [number, number];
  zoom?: number;
  pitch?: number;
  padding?: MapPadding;
}

export interface IncidentFocusCamera {
  center: [number, number];
  zoom: number;
  bearing: number;
  pitch: number;
  padding: MapPadding;
}

export const DEFAULT_PORTUGAL_CAMERA: IncidentFocusCamera = {
  center: [-8.0, 39.5],
  zoom: 6.2,
  bearing: 0,
  pitch: 0,
  padding: { top: 0, right: 0, bottom: 0, left: 0 },
};

export const INCIDENT_FOCUS_ENTER_DURATION_MS = 650;
export const INCIDENT_FOCUS_EXIT_DURATION_MS = 500;

const MIN_FOCUS_ZOOM = 9;
const MAX_FOCUS_ZOOM = 13;
const DEFAULT_FOCUS_PITCH = 45;
const MAX_FOCUS_PITCH = 55;

export interface IncidentFocusCameraOptions {
  targetZoom?: number;
  targetPitch?: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function captureCameraSnapshot(reader: CameraReader): CameraSnapshot {
  return {
    center: [...reader.getCenter()] as [number, number],
    zoom: reader.getZoom(),
    bearing: reader.getBearing(),
    pitch: reader.getPitch(),
    padding: { ...reader.getPadding() },
  };
}

export function buildIncidentFocusCamera(
  current: CameraSnapshot,
  target: IncidentFocusTarget,
  options: IncidentFocusCameraOptions = {},
): IncidentFocusCamera {
  const requestedZoom = options.targetZoom ?? target.zoom ?? Math.max(current.zoom + 2, MIN_FOCUS_ZOOM);
  const requestedPitch = options.targetPitch ?? target.pitch ?? DEFAULT_FOCUS_PITCH;

  return {
    center: [...target.center] as [number, number],
    zoom: clamp(requestedZoom, MIN_FOCUS_ZOOM, MAX_FOCUS_ZOOM),
    bearing: current.bearing,
    pitch: clamp(requestedPitch, 0, MAX_FOCUS_PITCH),
    padding: { ...(target.padding ?? current.padding) },
  };
}

export function buildPortugalOverviewCamera(): IncidentFocusCamera {
  return {
    ...DEFAULT_PORTUGAL_CAMERA,
    center: [...DEFAULT_PORTUGAL_CAMERA.center] as [number, number],
    padding: { ...DEFAULT_PORTUGAL_CAMERA.padding },
  };
}

export function isValidIncidentCenter(center: readonly number[]): center is [number, number] {
  return (
    center.length === 2 &&
    center.every(Number.isFinite) &&
    center[0] >= -180 &&
    center[0] <= 180 &&
    center[1] >= -90 &&
    center[1] <= 90
  );
}
