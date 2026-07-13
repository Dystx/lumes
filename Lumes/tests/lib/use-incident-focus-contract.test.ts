import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("incident focus hook contract", () => {
  it("owns mode transitions and listens for map readiness", () => {
    const source = readFileSync("src/lib/use-incident-focus.ts", "utf8");

    expect(source).toContain("useIncidentFocus");
    expect(source).toContain("MAP_READY_EVENT");
    expect(source).toContain("enterIncidentFocus");
    expect(source).toContain("exitIncidentFocus");
    expect(source).toContain("returnToPortugalOverview");
    expect(source).toContain("openerRef");
    expect(source).toContain("restoreFocusToOpener");
    expect(source).toContain("MAP_STYLE_RESTORED_EVENT");
    expect(source).toContain("setInterval(onMapSignal, 250)");
  });

  it("restores the camera when a focused incident loses valid geometry", () => {
    const source = readFileSync("src/lib/use-incident-focus.ts", "utf8");

    expect(source).toContain("if (mode === \"overview\" || hasValidIncidentGeometry) return;");
    expect(source).toContain("exitImmediately(savedCamera)");
  });
});
