import { describe, expect, it } from "vitest";
import type { ActiveFilter, IncidentFilterState } from "@/lib/incident-filters";
import { localizeActiveFilterLabel } from "@/lib/active-filter-labels";

const baseFilters: IncidentFilterState = {
  severities: new Set(["critical", "high"]),
  hideResolved: true,
  quick: "all",
  phase: null,
  resource: null,
  search: "",
};

function filter(id: string, label = `raw-${id}`): ActiveFilter {
  return { id, label, clear: () => {} };
}

describe("active filter labels", () => {
  it("localizes quick, severity, resolved, and resource labels", () => {
    expect(localizeActiveFilterLabel(filter("quick"), { ...baseFilters, quick: "critical" }, "pt")).toBe("Críticos");
    expect(localizeActiveFilterLabel(filter("severity"), baseFilters, "en")).toBe("Critical, High");
    expect(localizeActiveFilterLabel(filter("resolved"), { ...baseFilters, hideResolved: false }, "pt")).toBe("Incluir resolvidos");
    expect(localizeActiveFilterLabel(filter("resource"), { ...baseFilters, resource: "aircraft" }, "en")).toBe("With aircraft");
  });

  it("keeps search and phase values while localizing their labels", () => {
    expect(localizeActiveFilterLabel(filter("search"), { ...baseFilters, search: "  Lisboa  " }, "en")).toBe('"Lisboa"');
    expect(localizeActiveFilterLabel(filter("phase"), { ...baseFilters, phase: "Em Curso" }, "pt")).toBe("Em Curso");
    expect(localizeActiveFilterLabel(filter("phase"), { ...baseFilters, phase: "  " }, "pt")).toBe("raw-phase");
  });

  it("handles empty severity selections and unknown filter IDs safely", () => {
    expect(localizeActiveFilterLabel(filter("severity"), { ...baseFilters, severities: new Set() }, "pt")).toBe("Sem resultados");
    expect(localizeActiveFilterLabel(filter("severity"), { ...baseFilters, severities: new Set(["low", "critical"]) }, "en")).toBe("Critical, Low");
    expect(localizeActiveFilterLabel(filter("future-filter", "Future label"), baseFilters, "en")).toBe("Future label");
  });
});
