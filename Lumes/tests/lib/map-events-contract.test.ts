import { describe, expect, it } from "vitest";
import {
  MAP_READY_EVENT,
  MAP_STYLE_RESTORED_EVENT,
  MAP_STYLE_TRANSITION_EVENT,
} from "@/lib/map/map-events";

describe("map event contract", () => {
  it("keeps readiness event names stable and distinct", () => {
    expect(MAP_READY_EVENT).toBe("lumes:map-ready");
    expect(MAP_STYLE_TRANSITION_EVENT).toBe("lumes:map-style-transition");
    expect(MAP_STYLE_RESTORED_EVENT).toBe("lumes:map-style-restored");
    expect(MAP_READY_EVENT).not.toBe(MAP_STYLE_RESTORED_EVENT);
    expect(MAP_STYLE_TRANSITION_EVENT).not.toBe(MAP_STYLE_RESTORED_EVENT);
  });
});
