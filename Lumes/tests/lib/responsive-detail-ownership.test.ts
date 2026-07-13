import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const page = readFileSync(resolve(process.cwd(), "src/app/page.tsx"), "utf8");
const hook = readFileSync(resolve(process.cwd(), "src/hooks/use-wide-desktop.ts"), "utf8");
const panel = readFileSync(resolve(process.cwd(), "src/components/detail/IncidentDetailPanel.tsx"), "utf8");

describe("responsive incident detail ownership contract", () => {
  it("uses the xl breakpoint with a hydration-neutral state", () => {
    expect(hook).toContain('WIDE_DESKTOP_MEDIA_QUERY = "(min-width: 1280px)"');
    expect(hook).toContain("useState<boolean | null>(null)");
    expect(hook).toContain("mediaQuery.addEventListener(\"change\", sync)");
  });

  it("mounts mobile and desktop detail surfaces only for their owning viewport", () => {
    expect(page).toContain("open={isWideDesktop === false && !!selectedIncident");
    expect(page).toContain("{isWideDesktop === true && (");
    expect(page).toContain("selectedIncidentId={isWideDesktop === true ? selectedIncidentId : null}");
    expect(page).toContain("isWideDesktop === true && sharedIncidentDetailProps ? (");
  });

  it("exposes one queryable detail root with an explicit surface", () => {
    expect(panel).toContain('data-testid="incident-detail-panel"');
    expect(panel).toContain('data-incident-surface={isMobile ? "mobile" : "desktop"}');
  });

  it("shares selected incident detail data while keeping layout differences explicit", () => {
    expect(page).toContain('type IncidentDetailPanelProps } from "@/components/detail/IncidentDetailPanel"');
    expect(page).toContain("const sharedIncidentDetailProps = selectedIncident ?");
    expect(page).toContain('satisfies Omit<IncidentDetailPanelProps, "isMobile" | "hideHeader">');
    expect(page.match(/\{\.\.\.sharedIncidentDetailProps\}/g)?.length).toBe(2);
    expect(page).toContain("{...sharedIncidentDetailProps}\n            isMobile\n          />");
    expect(page).toContain("{...sharedIncidentDetailProps}\n              hideHeader\n            />");
    expect(page).not.toContain("enrichIncidentWithLiveContext(selectedIncident, weather.data, fireRisk.data)}");
  });
});
