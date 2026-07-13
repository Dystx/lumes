import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("biomass layer client boundary", () => {
  it("uses bounded typed fetching and fail-closed source updates", () => {
    const source = readFileSync("src/components/layers/biomass-layer.tsx", "utf8");
    expect(source).toContain("fetchJsonWithTimeout");
    expect(source).toContain("normalizeBiomassOverlayResponse");
    expect(source).toContain("setGeoJSONSourceData");
    expect(source).toContain("AbortController");
    expect(source).toContain('data-testid="biomass-layer-status"');
    expect(source).not.toContain("as { setData: (d: unknown) => void }");
  });
});
