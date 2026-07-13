import { afterEach, describe, expect, it } from "vitest";
import {
  ALL_SEVERITIES,
  buildActiveFilters,
  filterIncidents,
  isIncidentFilterBaseline,
  isSelectableIncident,
  type FilterableIncident,
  type IncidentFilterActions,
  type IncidentFilterState,
} from "@/lib/incident-filters";
import { useUIStore } from "@/store/ui-store";

const baseline: IncidentFilterState = {
  severities: new Set(ALL_SEVERITIES),
  hideResolved: true,
  quick: "all",
  phase: null,
  resource: null,
  search: "",
};

const incidents: FilterableIncident[] = [
  {
    id: "critical-active",
    displayName: "Serra do Caldeirao",
    severity: "critical",
    status: "active",
    municipality: "Loule",
    district: "Faro",
    parish: "Salir",
    phase: "Em Curso",
    personnel: 20,
    engines: 4,
    aircraft: 1,
  },
  {
    id: "high-resolved",
    displayName: "Mata Nacional",
    severity: "high",
    status: "resolved",
    municipality: "Sintra",
    district: "Lisboa",
    parish: "Colares",
    phase: "Encerrada",
    personnel: 0,
    engines: 0,
    aircraft: 0,
  },
  {
    id: "low-monitoring",
    displayName: "Vale Verde",
    severity: "low",
    status: "monitoring",
    municipality: "Loule",
    district: "Faro",
    parish: "Querença",
    phase: "Vigilância",
    personnel: 2,
    engines: 1,
    aircraft: 0,
  },
];

function makeActions(): IncidentFilterActions & { cleared: string[] } {
  const cleared: string[] = [];
  return {
    cleared,
    resetSeverities: () => cleared.push("severities"),
    setHideResolved: () => cleared.push("hide-resolved"),
    setQuick: () => cleared.push("quick"),
    setPhase: () => cleared.push("phase"),
    setResource: () => cleared.push("resource"),
    setSearch: () => cleared.push("search"),
  };
}

afterEach(() => {
  useUIStore.getState().resetIncidentFilters();
  useUIStore.getState().setSelectedIncidentId(null);
  useUIStore.getState().setFlyToIncidentId(null);
  useUIStore.setState({
    visibleSources: new Set(["satellite", "official", "community", "news"]),
    showFireRisk: false,
    showFireStations: false,
    showSatellite: false,
    showAerial: false,
    showBiomass: false,
    showCompositeRisk: false,
  });
});

describe("incident filter baseline", () => {
  it("treats the documented defaults as zero active constraints", () => {
    expect(isIncidentFilterBaseline(baseline)).toBe(true);
    expect(buildActiveFilters(baseline, makeActions())).toEqual([]);
  });

  it("represents every non-baseline constraint with one clear action", () => {
    const actions = makeActions();
    const filters = buildActiveFilters(
      {
        severities: new Set(["critical", "high"]),
        hideResolved: false,
        quick: "active",
        phase: "Em Curso",
        resource: "aircraft",
        search: "  loule ",
      },
      actions,
    );

    expect(filters.map((filter) => filter.id)).toEqual([
      "severity",
      "resolved",
      "quick",
      "phase",
      "resource",
      "search",
    ]);
    expect(filters.map((filter) => filter.label)).toContain("Search: loule");

    filters.forEach((filter) => filter.clear());
    expect(actions.cleared).toEqual([
      "severities",
      "hide-resolved",
      "quick",
      "phase",
      "resource",
      "search",
    ]);
  });
});

describe("filterIncidents", () => {
  it("hides resolved incidents at baseline without treating that as an active filter", () => {
    expect(filterIncidents(incidents, baseline).map((incident) => incident.id)).toEqual([
      "critical-active",
      "low-monitoring",
    ]);
  });

  it("combines search, quick, phase, resource, and severity constraints", () => {
    const filtered = filterIncidents(incidents, {
      severities: new Set(["critical", "high"]),
      hideResolved: false,
      quick: "high",
      phase: "Em Curso",
      resource: "personnel",
      search: "loule",
    });

    expect(filtered.map((incident) => incident.id)).toEqual(["critical-active"]);
  });

  it("only permits selection for incidents still visible under the active query", () => {
    const visibleIds = new Set(["critical-active"]);

    expect(isSelectableIncident(visibleIds, "critical-active")).toBe(true);
    expect(isSelectableIncident(visibleIds, "high-resolved")).toBe(false);
    expect(isSelectableIncident(visibleIds, null)).toBe(true);
  });
});

describe("useUIStore incident-filter actions", () => {
  it("resets query filters to the canonical baseline without changing map display state", () => {
    const store = useUIStore.getState();
    store.toggleSeverity("low");
    store.setHideResolved(false);
    store.setQuickFilter("high");
    store.setPhaseFilter("Em Curso");
    store.setResourceFilter("aircraft");
    store.setSearchQuery("loule");
    store.setShowFireRisk(true);
    store.toggleSource("official");

    store.resetIncidentFilters();
    const next = useUIStore.getState();

    expect(next.severityFilter).toEqual(new Set(ALL_SEVERITIES));
    expect(next.hideResolved).toBe(true);
    expect(next.quickFilter).toBe("all");
    expect(next.phaseFilter).toBeNull();
    expect(next.resourceFilter).toBeNull();
    expect(next.searchQuery).toBe("");
    expect(next.showFireRisk).toBe(true);
    expect(next.visibleSources.has("official")).toBe(false);
  });

  it("hydrates all query filters atomically without changing map display state", () => {
    const store = useUIStore.getState();
    store.setShowFireRisk(true);
    store.toggleSource("official");

    store.replaceIncidentFilters({
      severities: new Set(["critical"]),
      hideResolved: false,
      quick: "active",
      phase: "Em Curso",
      resource: "aircraft",
      search: "loule",
    });

    const next = useUIStore.getState();
    expect(next.severityFilter).toEqual(new Set(["critical"]));
    expect(next.hideResolved).toBe(false);
    expect(next.quickFilter).toBe("active");
    expect(next.phaseFilter).toBe("Em Curso");
    expect(next.resourceFilter).toBe("aircraft");
    expect(next.searchQuery).toBe("loule");
    expect(next.showFireRisk).toBe(true);
    expect(next.visibleSources.has("official")).toBe(false);
  });

  it("clears selection and map fly-to when filtering hides the selected incident", () => {
    const store = useUIStore.getState();
    store.setSelectedIncidentId("hidden");
    store.setFlyToIncidentId("hidden");

    store.reconcileIncidentSelection(new Set(["visible"]));

    expect(useUIStore.getState().selectedIncidentId).toBeNull();
    expect(useUIStore.getState().flyToIncidentId).toBeNull();
  });
});
