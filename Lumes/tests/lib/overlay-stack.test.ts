import { describe, expect, it } from "vitest";
import { closeOverlay, closeTopOverlay, openOverlay } from "@/lib/overlay-stack";

describe("overlay stack", () => {
  it("moves a reopened overlay to the top without duplicating it", () => {
    expect(openOverlay(["history", "report"], "history")).toEqual(["report", "history"]);
  });

  it("closes only the topmost blocking overlay", () => {
    expect(closeTopOverlay(["notifications", "report"])).toEqual({
      stack: ["notifications"],
      closed: "report",
    });
  });

  it("is a no-op when closing an already-closed overlay", () => {
    expect(closeOverlay(["notifications", "report"], "history")).toEqual(["notifications", "report"]);
    expect(closeTopOverlay([])).toEqual({ stack: [], closed: null });
  });
});
