import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(process.cwd());
const page = readFileSync(resolve(root, "src/app/page.tsx"), "utf8");
const filters = readFileSync(resolve(root, "src/components/filters/filters-panel.tsx"), "utf8");
const component = readFileSync(resolve(root, "src/components/filters/map-status-summary.tsx"), "utf8");

describe("map status summary UI contract", () => {
  it("keeps the summary isolated and wires visible severity counts through the page", () => {
    expect(page).toContain("countIncidentSeverities");
    expect(page).toContain("severityCounts: visibleSeverityCounts");
    expect(page).toContain('satisfies Omit<FiltersPanelProps, "variant" | "searchInputRef">');
    expect(filters).toContain("<MapStatusSummary");
    expect(filters).toContain("severityCounts");
  });

  it("exposes a localized, polite status region with an explicit empty state", () => {
    expect(component).toContain('data-testid="map-status-summary"');
    expect(component).toContain('aria-live="polite"');
    expect(component).toContain('aria-atomic="true"');
    expect(component).toContain("summary.emptyMessage");
    expect(component).toContain("summary.activeFilterLabel");
  });
});
