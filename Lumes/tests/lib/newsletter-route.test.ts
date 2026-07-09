import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/newsletter/subscribe/route";

describe("newsletter subscribe contract", () => {
  it("returns a non-cacheable validation state for an invalid JSON request", async () => {
    const request = new NextRequest("http://localhost/api/newsletter/subscribe", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "http://localhost" },
      body: JSON.stringify({ email: "not-an-email", locale: "pt" }),
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toMatchObject({ dataState: { state: "empty" } });
  });
});
