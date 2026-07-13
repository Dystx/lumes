import { beforeEach, describe, expect, it, vi } from "vitest";

const { cached } = vi.hoisted(() => ({ cached: vi.fn() }));
vi.mock("@/lib/api/cache", () => ({ cached }));

import { GET } from "@/app/api/dashboard/route";

describe("dashboard cache failure contract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cached.mockRejectedValue(new Error("private dashboard cache detail"));
  });

  it("returns a redacted non-cacheable retryable response", async () => {
    const response = await GET();
    const payload = await response.json();

    expect(response.status).toBe(500);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(payload).toMatchObject({
      error: "Dashboard data is temporarily unavailable.",
      dataState: { state: "retryable-error" },
    });
    expect(JSON.stringify(payload)).not.toContain("private dashboard cache detail");
  });
});
