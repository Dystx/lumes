import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { assertSafeOrigin, isSafeOrigin } from "@/lib/api/csrf";

describe("CSRF origin boundary", () => {
  it("allows configured same-origin hosts and rejects untrusted origins", () => {
    expect(isSafeOrigin(new NextRequest("http://localhost/api/test", {
      method: "POST",
      headers: { origin: "http://localhost" },
    }))).toBe(true);
    expect(isSafeOrigin(new NextRequest("https://lumes.pt/api/test", {
      method: "POST",
      headers: { origin: "https://attacker.invalid" },
    }))).toBe(false);
  });

  it("returns the normalized no-store invalid-request envelope", async () => {
    const response = assertSafeOrigin(new NextRequest("https://lumes.pt/api/test", {
      method: "POST",
      headers: { origin: "https://attacker.invalid" },
    }));

    expect(response?.status).toBe(403);
    expect(response?.headers.get("cache-control")).toBe("no-store");
    await expect(response?.json()).resolves.toMatchObject({
      dataState: { state: "empty", reason: "Cross-origin request rejected" },
    });
  });
});
