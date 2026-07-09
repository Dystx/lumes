import type { IncidentStatus, Severity } from "@/lib/types";

export const ALL_SEVERITIES = ["critical", "high", "medium", "low"] as const satisfies readonly Severity[];

export type QuickFilter = "all" | "critical" | "high" | "active";
export type ResourceFilter = "personnel" | "engines" | "aircraft";

/**
 * Query state only. Map layers and source visibility deliberately live in
 * MapDisplayState so changing a layer never changes the incident result set.
 */
export interface IncidentFilterState {
  severities: ReadonlySet<Severity>;
  hideResolved: boolean;
  quick: QuickFilter;
  phase: string | null;
  resource: ResourceFilter | null;
  search: string;
}

export interface ActiveFilter {
  id: string;
  label: string;
  clear: () => void;
}

export interface IncidentFilterActions {
  resetSeverities: () => void;
  setHideResolved: (value: boolean) => void;
  setQuick: (value: QuickFilter) => void;
  setPhase: (value: string | null) => void;
  setResource: (value: ResourceFilter | null) => void;
  setSearch: (value: string) => void;
}

/** A minimal common shape shared by sample and normalized live incidents. */
export interface FilterableIncident {
  id: string;
  displayName: string;
  severity: Severity;
  status?: IncidentStatus;
  incidentStatus?: IncidentStatus;
  municipality?: string;
  district?: string;
  parish?: string;
  phase?: string;
  personnel?: number;
  engines?: number;
  aircraft?: number;
  properties?: {
    statusGroup?: string;
    statusText?: string;
  };
}

const ACTIVE_STATUSES = new Set<IncidentStatus>(["active", "detected"]);

export function isIncidentFilterBaseline(filters: IncidentFilterState): boolean {
  return (
    filters.severities.size === ALL_SEVERITIES.length &&
    ALL_SEVERITIES.every((severity) => filters.severities.has(severity)) &&
    filters.hideResolved &&
    filters.quick === "all" &&
    filters.phase === null &&
    filters.resource === null &&
    filters.search.trim() === ""
  );
}

/** Selection may only point at an incident rendered by the active query. */
export function isSelectableIncident(
  visibleIncidentIds: ReadonlySet<string>,
  incidentId: string | null,
): boolean {
  return incidentId === null || visibleIncidentIds.has(incidentId);
}

/**
 * Produces exactly one removable chip for each non-baseline query constraint.
 * Labels are intentionally presentation-neutral so they can be localized by a
 * caller without reimplementing the baseline rules.
 */
export function buildActiveFilters(
  filters: IncidentFilterState,
  actions: IncidentFilterActions,
): ActiveFilter[] {
  const active: ActiveFilter[] = [];

  if (!hasAllSeverities(filters.severities)) {
    active.push({
      id: "severity",
      label: `Severity: ${Array.from(filters.severities).join(", ") || "none"}`,
      clear: actions.resetSeverities,
    });
  }
  if (!filters.hideResolved) {
    active.push({
      id: "resolved",
      label: "Including resolved",
      clear: () => actions.setHideResolved(true),
    });
  }
  if (filters.quick !== "all") {
    active.push({
      id: "quick",
      label: `Quick: ${filters.quick}`,
      clear: () => actions.setQuick("all"),
    });
  }
  if (filters.phase !== null) {
    active.push({
      id: "phase",
      label: `Phase: ${filters.phase}`,
      clear: () => actions.setPhase(null),
    });
  }
  if (filters.resource !== null) {
    active.push({
      id: "resource",
      label: `Has ${filters.resource}`,
      clear: () => actions.setResource(null),
    });
  }

  const search = filters.search.trim();
  if (search) {
    active.push({
      id: "search",
      label: `Search: ${search}`,
      clear: () => actions.setSearch(""),
    });
  }

  return active;
}

export function filterIncidents<T extends FilterableIncident>(
  incidents: readonly T[],
  filters: IncidentFilterState,
): T[] {
  const query = filters.search.trim().toLocaleLowerCase();

  return incidents.filter((incident) => {
    const status = incident.status ?? incident.incidentStatus;
    if (filters.hideResolved && status === "resolved") return false;
    if (!filters.severities.has(incident.severity)) return false;
    if (!matchesQuickFilter(incident, status, filters.quick)) return false;
    if (!matchesPhase(incident, filters.phase)) return false;
    if (!matchesResource(incident, filters.resource)) return false;
    return !query || matchesSearch(incident, query);
  });
}

function hasAllSeverities(severities: ReadonlySet<Severity>): boolean {
  return severities.size === ALL_SEVERITIES.length && ALL_SEVERITIES.every((severity) => severities.has(severity));
}

function matchesQuickFilter(
  incident: FilterableIncident,
  status: IncidentStatus | undefined,
  quick: QuickFilter,
): boolean {
  if (quick === "all") return true;
  if (quick === "active") return status !== undefined && ACTIVE_STATUSES.has(status);
  if (quick === "critical") return incident.severity === "critical";
  return incident.severity === "critical" || incident.severity === "high";
}

function matchesPhase(incident: FilterableIncident, phase: string | null): boolean {
  if (phase === null) return true;
  return incident.phase === phase || incident.properties?.statusGroup === phase || incident.properties?.statusText === phase;
}

function matchesResource(incident: FilterableIncident, resource: ResourceFilter | null): boolean {
  if (resource === null) return true;
  return (incident[resource] ?? 0) > 0;
}

function matchesSearch(incident: FilterableIncident, query: string): boolean {
  return [incident.displayName, incident.municipality, incident.district, incident.parish]
    .filter((value): value is string => typeof value === "string")
    .some((value) => value.toLocaleLowerCase().includes(query));
}
