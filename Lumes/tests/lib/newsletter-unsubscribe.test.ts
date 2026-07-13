import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { db, readNewsletterActionToken, sendEmail } = vi.hoisted(() => ({
  db: {
    newsletterSubscriber: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
  readNewsletterActionToken: vi.fn(),
  sendEmail: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/lib/newsletter-token", () => ({
  createNewsletterActionToken: vi.fn(() => "next-token"),
  readNewsletterActionToken,
}));
vi.mock("@/lib/email", () => ({
  buildUnsubscribeEmail: vi.fn(() => ({ to: "redacted@example.test", subject: "test", text: "test" })),
  sendEmail,
}));

import { GET, POST } from "@/app/api/newsletter/unsubscribe/route";

describe("newsletter unsubscribe contract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sendEmail.mockResolvedValue({ ok: true });
  });

  it("renders a confirmation page without mutating on GET", async () => {
    readNewsletterActionToken.mockReturnValue({ emailHash: "email-hash", issuedAt: Date.now() - 1000, expiresAt: Date.now() + 1000 });

    const response = await GET(new NextRequest("http://localhost/api/newsletter/unsubscribe?token=signed-token"));

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(db.newsletterSubscriber.findUnique).not.toHaveBeenCalled();
    expect(db.newsletterSubscriber.update).not.toHaveBeenCalled();
  });

  it("returns a redacted retryable response when unsubscribe storage fails", async () => {
    readNewsletterActionToken.mockReturnValue({ emailHash: "email-hash", issuedAt: Date.now() - 1000, expiresAt: Date.now() + 1000 });
    db.newsletterSubscriber.findUnique.mockRejectedValue(new Error("private database detail"));

    const response = await POST(new NextRequest("http://localhost/api/newsletter/unsubscribe", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "http://localhost" },
      body: JSON.stringify({ token: "signed-token" }),
    }));

    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const payload = await response.json();
    expect(payload).toMatchObject({ dataState: { state: "retryable-error" } });
    expect(JSON.stringify(payload)).not.toContain("private database detail");
  });

  it("rejects a replay after the subscriber is already unsubscribed", async () => {
    readNewsletterActionToken.mockReturnValue({ emailHash: "email-hash", issuedAt: Date.now() - 1000, expiresAt: Date.now() + 1000 });
    db.newsletterSubscriber.findUnique.mockResolvedValue({
      id: "subscriber-1",
      email: "redacted@example.test",
      emailHash: "email-hash",
      unsubscribedAt: new Date(),
      updatedAt: new Date(),
    });

    const response = await POST(new NextRequest("http://localhost/api/newsletter/unsubscribe", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "http://localhost" },
      body: JSON.stringify({ token: "signed-token" }),
    }));

    expect(response.status).toBe(410);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(db.newsletterSubscriber.update).not.toHaveBeenCalled();
  });

  it("rotates the confirmation token on a valid unsubscribe", async () => {
    readNewsletterActionToken.mockReturnValue({ emailHash: "email-hash", issuedAt: Date.now() - 1000, expiresAt: Date.now() + 1000 });
    db.newsletterSubscriber.findUnique.mockResolvedValue({
      id: "subscriber-1",
      email: "redacted@example.test",
      emailHash: "email-hash",
      unsubscribedAt: null,
      updatedAt: new Date(Date.now() - 10_000),
    });

    const response = await POST(new NextRequest("http://localhost/api/newsletter/unsubscribe", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "http://localhost" },
      body: JSON.stringify({ token: "signed-token" }),
    }));

    expect(response.status).toBe(200);
    expect(db.newsletterSubscriber.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        unsubscribedAt: expect.any(Date),
        confirmToken: expect.stringMatching(/^[a-f0-9]{48}$/),
      }),
    }));
  });
});
