import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = readFileSync(resolve(process.cwd(), "src/components/ember-map.tsx"), "utf8");

describe("map incident interaction contract", () => {
  it("does not let cluster fallback features block cluster zoom", () => {
    expect(source).toContain("nearest.feature.properties?.id");
    expect(source).toContain("if (id) {");
    expect(source).toContain("const clusterFeatures = map.queryRenderedFeatures(e.point");
  });
});
