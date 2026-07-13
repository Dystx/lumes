import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("risk layer client boundary", () => {
  it("uses bounded typed fetching and fail-closed source updates", () => {
    const source = readFileSync("src/components/layers/risk-layer.tsx", "utf8");
    expect(source).toContain("fetchJsonWithTimeout");
    expect(source).toContain("normalizeRiskOverlayResponse");
    expect(source).toContain("setGeoJSONSourceData");
    expect(source).toContain("AbortController");
    expect(source).toContain('data-testid="risk-layer-status"');
    expect(source).not.toContain("as { setData: (d: unknown) => void }");
  });
});
