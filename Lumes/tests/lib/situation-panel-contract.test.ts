import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("situation panel empty-state contract", () => {
  it("keeps an explicit marker for a healthy empty priority list", () => {
    const source = readFileSync("src/components/shell/situation-panel.tsx", "utf8");
    expect(source).toContain('data-testid="situation-empty"');
    expect(source).toContain("priorityIncidents.length === 0");
  });
});
