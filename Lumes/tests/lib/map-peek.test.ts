import { describe, expect, it } from "vitest";
import { mapPeekActiveLabel } from "@/components/mobile/map-peek";

describe("mobile map peek summary", () => {
  it("labels the primary count as active incidents in both locales", () => {
    expect(mapPeekActiveLabel("pt")).toBe("ativos");
    expect(mapPeekActiveLabel("en")).toBe("active");
  });
});
