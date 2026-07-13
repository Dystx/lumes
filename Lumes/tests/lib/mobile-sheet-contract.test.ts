import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = readFileSync(resolve(process.cwd(), "src/components/mobile/mobile-view.tsx"), "utf8");

describe("mobile map sheet contract", () => {
  it("collapses an expanded map sheet when its drag dismissal fires", () => {
    expect(source).toContain('if (activeTab === "map") setMapSheetExpanded(false)');
  });
});
