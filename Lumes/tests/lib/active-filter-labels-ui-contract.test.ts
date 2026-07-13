import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const page = readFileSync(resolve(process.cwd(), "src/app/page.tsx"), "utf8");
const filtersPanel = readFileSync(resolve(process.cwd(), "src/components/filters/filters-panel.tsx"), "utf8");

describe("active filter label UI contract", () => {
  it("keeps localization in the tested presentation adapter", () => {
    expect(page).toContain('from "@/lib/active-filter-labels"');
    expect(page).toContain("label: localizeActiveFilterLabel(filter, incidentFilters, lang)");
    expect(page).not.toContain("Incluir resolvidos");
    expect(page).not.toContain("Com pessoal");
    expect(page).toContain('satisfies Omit<FiltersPanelProps, "variant" | "searchInputRef">');
    expect(page.match(/\{\.\.\.sharedFilters\}/g)?.length).toBe(2);
    expect(page.match(/activeFilters: activeFilterItems/g)?.length).toBe(1);
    expect(page.match(/searchInputRef=\{searchInputRef\}/g)?.length).toBe(1);
  });

  it("keeps full filter reset ownership in the filter panel", () => {
    expect(page).not.toContain("const resetAllFilters =");
    // The page may pass the store-owned reset action to the dashboard's
    // Following empty state; it must not rebuild a second reset aggregate.
    expect(page).toContain("onClearIncidentFilters={resetIncidentFilters}");
  });

  it("clears phase and resource filters with the other query filters", () => {
    expect(page).toContain("    phaseFilter,\n    setPhaseFilter,\n    resourceFilter,\n    setResourceFilter,\n    severityFilter,");
    expect(page.match(/phaseFilter=\{phaseFilter\}/g)?.length).toBe(1);
    expect(page.match(/setPhaseFilter=\{setPhaseFilter\}/g)?.length).toBe(1);
    expect(page.match(/resourceFilter=\{resourceFilter\}/g)?.length).toBe(1);
    expect(page.match(/setResourceFilter=\{setResourceFilter\}/g)?.length).toBe(1);
    expect(filtersPanel).toContain("setPhaseFilter(null)");
    expect(filtersPanel).toContain("setResourceFilter(null)");
    expect(filtersPanel).toContain("phaseFilter !== null");
    expect(filtersPanel).toContain("resourceFilter !== null");
  });
});
