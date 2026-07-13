import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("aerial optional-layer UI contract", () => {
  it("propagates provider state into the existing advanced-layer warning surface", () => {
    const page = readFileSync("src/app/page.tsx", "utf8");
    const host = readFileSync("src/components/advanced-layers-host.tsx", "utf8");
    const layer = readFileSync("src/components/layers/aerial-layer.tsx", "utf8");
    const filters = readFileSync("src/components/filters/filters-panel.tsx", "utf8");

    expect(page).toContain("onAerialStatusChange={setAerialStatus}");
    expect(page).toContain("aerialStatus,");
    expect(page).toContain('satisfies Omit<FiltersPanelProps, "variant" | "searchInputRef">');
    expect(host).toContain("onAerialStatusChange");
    expect(layer).toContain("onStatusChange");
    expect(layer).toContain("fetchJsonWithTimeout");
    expect(layer).toContain("normalizeAerialOverlayResponse");
    expect(layer).toContain("setGeoJSONSourceData");
    expect(layer).toContain("AbortController");
    expect(layer).not.toContain("as { setData: (d: unknown) => void }");
    expect(filters).toContain('data-testid="aerial-source-warning"');
    expect(filters).toContain("Partial aerial sources");
  });

  it("adds the fixed-wing icon on its first successful image load", () => {
    const layer = readFileSync("src/components/layers/aerial-layer.tsx", "utf8");

    expect(layer).toContain('if (cancelled) return;');
    expect(layer).toContain('if (!map.hasImage("plane-icon")) {');
    expect(layer).toContain('map.addImage("plane-icon", img.data as ImageBitmap);');
    expect(layer).not.toContain('if (cancelled || !map.hasImage("plane-icon")) return;');
  });
});
