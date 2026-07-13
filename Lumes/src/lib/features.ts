export interface LumesFeatureFlags {
  incidentFocus3d: boolean;
}

export const featureFlags: LumesFeatureFlags = {
  incidentFocus3d: process.env.NEXT_PUBLIC_LUMES_3D_INCIDENT_FOCUS === "1",
};

export function isFeatureEnabled(feature: keyof LumesFeatureFlags): boolean {
  return featureFlags[feature];
}
