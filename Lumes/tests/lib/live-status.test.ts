import { describe, expect, it } from "vitest";
import { resolveLiveStatusTransition } from "@/lib/live-status";

describe("live data status transitions", () => {
  it("announces the first transition into fallback", () => {
    expect(resolveLiveStatusTransition({
      previousUsingFallback: false,
      usingFallback: true,
      liveCount: 0,
    })).toBe("fallback");
  });

  it("does not repeat fallback notifications while fallback remains active", () => {
    expect(resolveLiveStatusTransition({
      previousUsingFallback: true,
      usingFallback: true,
      liveCount: 4,
    })).toBeNull();
  });

  it("announces recovery only when live incidents are available", () => {
    expect(resolveLiveStatusTransition({
      previousUsingFallback: true,
      usingFallback: false,
      liveCount: 2,
    })).toBe("restored");

    expect(resolveLiveStatusTransition({
      previousUsingFallback: true,
      usingFallback: false,
      liveCount: 0,
    })).toBeNull();
  });

  it("does not announce a transition when the status is unchanged", () => {
    expect(resolveLiveStatusTransition({
      previousUsingFallback: false,
      usingFallback: false,
      liveCount: 3,
    })).toBeNull();
  });
});
