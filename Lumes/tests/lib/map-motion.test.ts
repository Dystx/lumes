import { describe, expect, it } from "vitest";
import { mapMotionOptions } from "@/lib/map-motion";

describe("map motion policy", () => {
  it("removes non-essential map movement for reduced-motion users", () => {
    expect(mapMotionOptions(true, 1200)).toEqual({ duration: 0, essential: false });
  });

  it("retains the requested duration otherwise", () => {
    expect(mapMotionOptions(false, 500)).toEqual({ duration: 500, essential: true });
  });
});
