import type { DashboardResponse } from "@/lib/types";
import type { Incident } from "@/lib/sample-data";

export interface DashboardMetrics {
  total: number;
  activeCount: number;
  criticalCount: number;
  highCount: number;
  personnel: number;
  aircraft: number;
  engines: number;
  areaHa: number;
  byType: Record<string, number>;
  byStatusGroup: Record<string, number>;
}

/**
 * Prefer the server's aggregate, but keep the dashboard useful while that
 * request is loading or unavailable by computing the same contract locally.
 */
export function buildDashboardMetrics(
  dashboard: DashboardResponse | null,
  incidents: readonly Incident[],
): DashboardMetrics {
  if (dashboard?.summary) {
    return {
      ...dashboard.summary,
      byType: dashboard.distribution.byType,
      byStatusGroup: dashboard.distribution.byStatusGroup ?? {},
    };
  }

  const active = incidents.filter((incident) => incident.status === "active" || incident.status === "detected");
  const critical = incidents.filter((incident) => incident.severity === "critical");
  const high = incidents.filter((incident) => incident.severity === "high");
  const byType: Record<string, number> = {};
  const byStatusGroup: Record<string, number> = {};

  for (const incident of incidents) {
    const type = incident.properties?.naturezaText || incident.properties?.rasi || "other";
    byType[type] = (byType[type] || 0) + 1;
    const statusGroup = incident.properties?.statusGroup
      || incident.properties?.statusText
      || incident.status
      || "other";
    byStatusGroup[statusGroup] = (byStatusGroup[statusGroup] || 0) + 1;
  }

  return {
    total: incidents.length,
    activeCount: active.length,
    criticalCount: critical.length,
    highCount: high.length,
    personnel: incidents.reduce((sum, incident) => sum + (incident.personnel || 0), 0),
    aircraft: incidents.reduce((sum, incident) => sum + (incident.aircraft || 0), 0),
    engines: incidents.reduce((sum, incident) => sum + (incident.engines || 0), 0),
    areaHa: incidents.reduce((sum, incident) => sum + (incident.estimatedAreaHa || 0), 0),
    byType,
    byStatusGroup,
  };
}
