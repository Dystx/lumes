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

export function buildReportPayload(values: ReportFormValues): ReportRequestPayload {
  return {
    type: values.reportType,
    lat: values.latitude,
    lon: values.longitude,
    description: values.description || undefined,
    name: values.reporterName || undefined,
  };
}
