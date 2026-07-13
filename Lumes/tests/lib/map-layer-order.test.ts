import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("optional map layer ordering", () => {
  it("inserts biomass and composite-risk context before the canonical incident symbol layer", () => {
    const map = readFileSync("src/components/ember-map.tsx", "utf8");
    const biomass = readFileSync("src/components/layers/biomass-layer.tsx", "utf8");
    const risk = readFileSync("src/components/layers/risk-layer.tsx", "utf8");

    expect(map).toContain('incidentFill: "ember-incidents-fill"');
    expect(biomass).toContain('const INCIDENT_SYMBOL_LAYER = "ember-incidents-fill";');
    expect(risk).toContain('const INCIDENT_SYMBOL_LAYER = "ember-incidents-fill";');
    expect(biomass).not.toContain('const INCIDENT_SYMBOL_LAYER = "ember-incidents-symbol";');
    expect(risk).not.toContain('const INCIDENT_SYMBOL_LAYER = "ember-incidents-symbol";');
  });
});
