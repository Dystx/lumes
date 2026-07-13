import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("mobile sheet scroll ownership", () => {
  it("keeps DashboardPanel from introducing a nested vertical scroll container", () => {
    const dashboard = readFileSync("src/components/dashboard/DashboardPanel.tsx", "utf8");
    expect(dashboard).toContain('className="flex-1 min-h-0"');
    expect(dashboard).not.toContain('className="flex-1 overflow-y-auto ember-scroll"');
  });
});
