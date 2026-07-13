import {
  ALL_SEVERITIES,
  type IncidentFilterState,
  type QuickFilter,
  type ResourceFilter,
} from "@/lib/incident-filters";
import type { Severity } from "@/lib/types";

const FILTER_QUERY_KEYS = ["severity", "includeResolved", "quick", "phase", "resource", "q"] as const;
const QUICK_FILTERS = new Set<QuickFilter>(["all", "critical", "high", "active"]);
const RESOURCE_FILTERS = new Set<ResourceFilter>(["personnel", "engines", "aircraft"]);

function isSeverity(value: string): value is Severity {
  return (ALL_SEVERITIES as readonly string[]).includes(value);
}

function parseSeverities(value: string | null): ReadonlySet<Severity> {
  if (value === null) return new Set(ALL_SEVERITIES);
  if (value === "none") return new Set();

  const requested = new Set(value.split(",").filter(isSeverity));
  // Invalid or empty input should not accidentally hide every incident.
  if (requested.size === 0) return new Set(ALL_SEVERITIES);
  return new Set(ALL_SEVERITIES.filter((severity) => requested.has(severity)));
}

export function parseIncidentFilterQuery(params: URLSearchParams): IncidentFilterState {
  const quickParam = params.get("quick");
  const resourceParam = params.get("resource");

  return {
    severities: parseSeverities(params.get("severity")),
    hideResolved: params.get("includeResolved") !== "1",
    quick: quickParam && QUICK_FILTERS.has(quickParam as QuickFilter)
      ? quickParam as QuickFilter
      : "all",
    phase: params.get("phase") || null,
    resource: resourceParam && RESOURCE_FILTERS.has(resourceParam as ResourceFilter)
      ? resourceParam as ResourceFilter
      : null,
    search: params.get("q") ?? "",
  };
}

export function writeIncidentFilterQuery(
  params: URLSearchParams,
  filters: IncidentFilterState,
): URLSearchParams {
  for (const key of FILTER_QUERY_KEYS) params.delete(key);

  const allSeverities = ALL_SEVERITIES.every((severity) => filters.severities.has(severity));
  if (!allSeverities) {
    const severityValue = filters.severities.size === 0
      ? "none"
      : ALL_SEVERITIES.filter((severity) => filters.severities.has(severity)).join(",");
    params.set("severity", severityValue);
  }
  if (!filters.hideResolved) params.set("includeResolved", "1");
  if (filters.quick !== "all") params.set("quick", filters.quick);
  if (filters.phase) params.set("phase", filters.phase);
  if (filters.resource) params.set("resource", filters.resource);
  if (filters.search) params.set("q", filters.search);

  return params;
}
