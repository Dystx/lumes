import { describe, expect, it } from "vitest";
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
});
