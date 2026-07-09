import { describe, expect, it } from "vitest";
import { nextFocusIndex } from "@/lib/focus-trap";

describe("focus trap navigation", () => {
  it("wraps forward focus from the last element", () => {
    expect(nextFocusIndex(3, 2, false)).toBe(0);
  });

  it("wraps reverse focus from the first element", () => {
    expect(nextFocusIndex(3, 0, true)).toBe(2);
  });
});
