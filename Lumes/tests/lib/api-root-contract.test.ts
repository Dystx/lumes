import { describe, expect, it } from "vitest";
import { GET } from "@/app/api/route";

describe("root API contract", () => {
  it("returns a non-cacheable service descriptor instead of a placeholder", async () => {
    const response = await GET();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({ service: "lumes.pt", status: "ok" });
  });
});
