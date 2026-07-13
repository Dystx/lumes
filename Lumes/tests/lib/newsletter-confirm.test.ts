import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { findUnique, update } = vi.hoisted(() => ({
  findUnique: vi.fn(),
  update: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: { newsletterSubscriber: { findUnique, update } },
}));

import { GET } from "@/app/api/newsletter/confirm/route";

describe("newsletter confirmation token lifecycle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rotates the confirmation token after the first successful use", async () => {
    findUnique.mockResolvedValue({
      id: "subscriber-1",
      // Keep the fixture inside the route's 24-hour confirmation window.
      createdAt: new Date(Date.now() - 60_000),
      confirmedAt: null,
      unsubscribedAt: null,
    });

    const response = await GET(new NextRequest("http://localhost/api/newsletter/confirm?token=valid-confirmation-token"));

    expect(response.status).toBe(200);
    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "subscriber-1" },
      data: expect.objectContaining({
        confirmedAt: expect.any(Date),
        confirmToken: expect.stringMatching(/^[a-f0-9]{48}$/),
      }),
    }));
  });

  it("rejects a replay when the subscriber is already confirmed", async () => {
    findUnique.mockResolvedValue({
      id: "subscriber-1",
      createdAt: new Date("2026-07-12T09:00:00.000Z"),
      confirmedAt: new Date("2026-07-12T09:05:00.000Z"),
      unsubscribedAt: null,
    });

    const response = await GET(new NextRequest("http://localhost/api/newsletter/confirm?token=replayed-confirmation-token"));

    expect(response.status).toBe(410);
    expect(update).not.toHaveBeenCalled();
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
});
