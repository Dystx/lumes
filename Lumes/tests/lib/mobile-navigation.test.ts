import { describe, expect, it } from "vitest";
import { MOBILE_TABS, mobileTabLabel } from "@/lib/mobile-navigation";

describe("mobile navigation", () => {
  it("keeps the four citizen tasks in a stable order", () => {
    expect(MOBILE_TABS).toEqual(["map", "incidents", "alerts", "more"]);
  });

  it("localizes every mobile destination", () => {
    expect(mobileTabLabel("alerts", "en")).toBe("Alerts");
    expect(mobileTabLabel("incidents", "pt")).toBe("Incêndios");
  });
});
