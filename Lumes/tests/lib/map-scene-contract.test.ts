import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("responsive map ownership contract", () => {
  it("has one page-level map ownership path and a complete scene adapter", () => {
    const page = readFileSync("src/app/page.tsx", "utf8");
    const scene = readFileSync("src/components/map/map-scene.tsx", "utf8");

    expect(page.match(/<EmberMap\b/g)?.length ?? 0).toBe(0);
    expect(page).toContain("<MapScene");
    expect(scene).toContain("extends EmberMapProps");
    expect(scene).toContain("mapProps");
    expect(scene).toContain("ResizeObserver");
  });
});
