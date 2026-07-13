import { describe, expect, it } from "vitest";
import { trustIndicatorLabel } from "@/components/ui/data-trust-indicator";

describe("data trust indicator", () => {
  it("uses explicit localized labels for freshness and recovery states", () => {
    expect(trustIndicatorLabel("healthy", "pt")).toBe("Atualizado");
    expect(trustIndicatorLabel("fallback", "en")).toBe("Fallback data");
    expect(trustIndicatorLabel("stale", "pt")).toBe("Dados desatualizados");
    expect(trustIndicatorLabel("retryable-error", "en")).toBe("Retrying");
  });
});
