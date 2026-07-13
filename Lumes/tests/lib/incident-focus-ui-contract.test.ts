import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("incident focus UI contract", () => {
  it("keeps the UI feature-flagged, localized, and explicit about exits", () => {
    const component = readFileSync("src/components/map/incident-focus-controls.tsx", "utf8");
    const translations = readFileSync("src/lib/i18n.ts", "utf8");

    expect(component).toContain("incidentFocus");
    expect(component).toContain("onReturnToOverview");
    expect(component).toContain("aria-live");
    expect(component).toContain("prefers-reduced-motion");
    expect(translations).toContain("incidentFocus:");
    expect(translations).toContain("exploreArea");
    expect(translations).toContain("returnOverview");
  });

  it("keeps compact focus on the map and restores the prior tab", () => {
    const page = readFileSync("src/app/page.tsx", "utf8");
    const mobileView = readFileSync("src/components/mobile/mobile-view.tsx", "utf8");

    expect(page).toContain("focusPreviousMobileTab");
    expect(page).toContain("restoreMobileTabAfterFocus");
    expect(page).toContain("incidentFocusActive={incidentFocusActive}");
    expect(mobileView).toContain("const activeTab = incidentFocusActive ? \"map\" : selectedTab;");
    expect(mobileView).toContain("data-testid=\"mobile-map-surface\"");
    expect(mobileView).toContain("disabled={incidentFocusActive && tab !== \"map\"}");
    expect(mobileView).toContain("? (visibleMapSheetExpanded ? \"h-[52vh]\" : \"h-14\")");
  });

  it("keeps the desktop focus status below the attribution chrome", () => {
    const page = readFileSync("src/app/page.tsx", "utf8");
    const mapChrome = readFileSync("src/components/map/map-chrome.tsx", "utf8");

    expect(page).toContain('region="status" topOffset={48}');
    expect(mapChrome).toContain("topOffset?: number");
    expect(mapChrome).toContain("safeTopOffset");
  });

  it("keeps an active focus exit visible during transient style reloads", () => {
    const hook = readFileSync("src/lib/use-incident-focus.ts", "utf8");

    expect(hook).toContain('mode !== "overview"');
    expect(hook).toContain("Capability is an entry gate");
  });
});
