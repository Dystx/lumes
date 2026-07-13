import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { escapePopupText, safePopupNumber } from "@/lib/map-popup";

describe("map popup content", () => {
  it("escapes feature-provided text before interpolation", () => {
    expect(escapePopupText('<img src=x onerror="alert(1)">')).toBe(
      "&lt;img src=x onerror=&quot;alert(1)&quot;&gt;",
    );
  });

  it("rejects non-finite values", () => {
    expect(safePopupNumber("Infinity", 0)).toBe(0);
    expect(safePopupNumber("12.5", 0)).toBe(12.5);
  });

  it("keeps MapLibre popup feature handling typed", () => {
    const source = readFileSync("src/components/ember-map.tsx", "utf8");
    expect(source).not.toContain("buildPopupHtml = (props: any)");
    expect(source).not.toContain("feature: any");
    expect(source).not.toContain("const g: any = f.geometry");
  });
});
