import { describe, expect, it } from "vitest";
import { timeAgo } from "@/lib/relative-time";

const NOW = Date.parse("2026-07-12T12:00:00Z");

describe("localized relative time", () => {
  it("formats minute, hour, and day thresholds in English", () => {
    expect(timeAgo("2026-07-12T12:00:00Z", "en", NOW)).toBe("just now");
    expect(timeAgo("2026-07-12T11:30:00Z", "en", NOW)).toBe("30m ago");
    expect(timeAgo("2026-07-12T10:00:00Z", "en", NOW)).toBe("2h ago");
    expect(timeAgo("2026-07-10T12:00:00Z", "en", NOW)).toBe("2d ago");
  });

  it("formats the same thresholds in Portuguese", () => {
    expect(timeAgo("2026-07-12T12:00:00Z", "pt", NOW)).toBe("agora");
    expect(timeAgo("2026-07-12T11:30:00Z", "pt", NOW)).toBe("há 30 min");
    expect(timeAgo("2026-07-12T10:00:00Z", "pt", NOW)).toBe("há 2 h");
    expect(timeAgo("2026-07-10T12:00:00Z", "pt", NOW)).toBe("há 2 d");
  });

  it("clamps future timestamps to the just-now state", () => {
    expect(timeAgo("2026-07-12T13:00:00Z", "en", NOW)).toBe("just now");
  });
});
