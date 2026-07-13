export type IncidentFocusCapabilityMode = "none" | "camera-only" | "full-context";
export type IncidentFocusCapabilityReason =
  | "available"
  | "webgl-unavailable"
  | "low-capability"
  | "map-not-ready"
  | "invalid-geometry";

export interface IncidentFocusCapabilityInput {
  webglSupported: boolean;
  mapReady: boolean;
  hasValidIncidentGeometry: boolean;
  viewportWidth: number;
  hardwareConcurrency?: number;
  deviceMemory?: number;
}

export interface IncidentFocusCapability {
  allowed: boolean;
  mode: IncidentFocusCapabilityMode;
  reason: IncidentFocusCapabilityReason;
}

const MOBILE_VIEWPORT_MAX = 767;
const LOW_CORE_COUNT = 4;
const LOW_DEVICE_MEMORY_GIB = 4;

export function getIncidentFocusCapability(
  input: IncidentFocusCapabilityInput,
): IncidentFocusCapability {
  if (!input.mapReady) {
    return { allowed: false, mode: "none", reason: "map-not-ready" };
  }
  if (!input.hasValidIncidentGeometry) {
    return { allowed: false, mode: "none", reason: "invalid-geometry" };
  }
  if (!input.webglSupported) {
    return { allowed: false, mode: "none", reason: "webgl-unavailable" };
  }

  const unknownCoreCount = typeof input.hardwareConcurrency !== "number" || input.hardwareConcurrency <= 0;
  const unknownMemory = typeof input.deviceMemory !== "number" || input.deviceMemory <= 0;
  const lowCoreCount = !unknownCoreCount && (input.hardwareConcurrency ?? 0) < LOW_CORE_COUNT;
  const lowMemory = !unknownMemory && (input.deviceMemory ?? 0) < LOW_DEVICE_MEMORY_GIB;

  if (input.viewportWidth <= MOBILE_VIEWPORT_MAX && (unknownCoreCount || unknownMemory || lowCoreCount || lowMemory)) {
    return { allowed: true, mode: "camera-only", reason: "low-capability" };
  }

  return { allowed: true, mode: "full-context", reason: "available" };
}
