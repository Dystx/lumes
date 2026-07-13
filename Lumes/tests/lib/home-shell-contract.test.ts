import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("home shell boundary", () => {
  it("keeps page-level shell ownership outside the map component", () => {
    const source = readFileSync("src/components/shell/home-shell.tsx", "utf8");
    expect(source).toContain("h-screen w-full");
    expect(source).toContain("skipLink");
  });
});
