import { afterEach, describe, expect, it, vi } from "vitest";
import { logServerFailure } from "@/lib/observability";

describe("server failure logging", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("logs structured route context without an error message that may contain personal data", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    logServerFailure("newsletter.subscribe", new Error("subscriber ana@example.com failed"), {
      route: "/api/newsletter/subscribe",
      retryable: true,
    });

    expect(spy).toHaveBeenCalledOnce();
    expect(spy.mock.calls[0][0]).toBe(JSON.stringify({
      level: "error",
      event: "newsletter.subscribe",
      route: "/api/newsletter/subscribe",
      retryable: true,
      errorName: "Error",
    }));
  });
});
