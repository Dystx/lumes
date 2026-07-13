import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { decideIncidentSelection } from "@/lib/incident-selection";

const pageSource = readFileSync(resolve(process.cwd(), "src/app/page.tsx"), "utf8");

describe("decideIncidentSelection", () => {
  const visibleIds = new Set(["visible"]);

  it("selects a visible list incident without changing map fly-to state", () => {
    expect(decideIncidentSelection(visibleIds, "visible", "list")).toEqual({
      selectedIncidentId: "visible",
    });
  });

  it("selects a visible map incident and requests a fly-to", () => {
    expect(decideIncidentSelection(visibleIds, "visible", "map")).toEqual({
      selectedIncidentId: "visible",
      flyToIncidentId: "visible",
    });
  });

  it("clears both selection channels when a hidden incident is requested", () => {
    expect(decideIncidentSelection(visibleIds, "hidden", "list")).toEqual({
      selectedIncidentId: null,
      flyToIncidentId: null,
    });
    expect(decideIncidentSelection(visibleIds, "hidden", "map")).toEqual({
      selectedIncidentId: null,
      flyToIncidentId: null,
    });
  });

  it("allows clearing selection without issuing a new map fly-to", () => {
    expect(decideIncidentSelection(visibleIds, null, "map")).toEqual({
      selectedIncidentId: null,
    });
    expect(decideIncidentSelection(visibleIds, null, "list")).toEqual({
      selectedIncidentId: null,
    });
  });

  it("keeps map and list selection handlers distinct", () => {
    expect(
      pageSource.match(/onSelectIncident=\{handleSelectIncident\}/g),
    ).toHaveLength(2);
    expect(
      pageSource.match(/onTapIncident=\{handleSelectIncident\}/g),
    ).toHaveLength(1);
    expect(
      pageSource.match(/onSelectIncident=\{handleSelectIncidentFromMap\}/g),
    ).toHaveLength(1);
    expect(
      pageSource.match(/handleSelectIncidentFromMap\(markerMenu\.incidentId\)/g),
    ).toHaveLength(1);
  });

  it("routes notification selection through the guarded list handler", () => {
    const notificationsBlock = pageSource.match(
      /<NotificationsDrawer[\s\S]*?\n\s*\/\>\n\s*\)\}/,
    )?.[0];

    expect(notificationsBlock).toBeDefined();
    expect(notificationsBlock).toContain("handleSelectIncident(id)");
    expect(notificationsBlock).toContain("setNotifOpen(false)");
    expect(notificationsBlock).not.toContain("setSelectedIncidentId(id)");
  });
});
