export type CommunityReportType = "smoke" | "flame" | "road_closure" | "evacuation" | "contained";

export interface ReportFormValues {
  reportType: CommunityReportType;
  latitude: number;
  longitude: number;
  description?: string;
  reporterName?: string;
}

export interface ReportRequestPayload {
  type: CommunityReportType;
  lat: number;
  lon: number;
  description?: string;
  name?: string;
}

interface ApiActionResponse {
  ok?: boolean;
  error?: string;
}

export function buildReportPayload(values: ReportFormValues): ReportRequestPayload {
  return {
    type: values.reportType,
    lat: values.latitude,
    lon: values.longitude,
    description: values.description || undefined,
    name: values.reporterName || undefined,
  };
}

export async function persistFollowChange(incidentId: string, shouldFollow: boolean): Promise<void> {
  const response = await fetch("/api/follow", {
    method: shouldFollow ? "POST" : "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ incidentId }),
  });
  const payload = await response.json().catch(() => ({})) as ApiActionResponse;
  if (!response.ok || !payload.ok) {
    throw new Error(payload.error || `Unable to ${shouldFollow ? "follow" : "unfollow"} this incident.`);
  }
}
