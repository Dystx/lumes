import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { db, isEmailProviderConfigured, sendEmail } = vi.hoisted(() => ({
  db: {
    newsletterSubscriber: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  },
  isEmailProviderConfigured: vi.fn(),
  sendEmail: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/lib/email", () => ({
  isEmailProviderConfigured,
  sendEmail,
  buildConfirmationEmail: vi.fn(() => ({ to: "redacted@example.test", subject: "test", text: "test" })),
}));

import { POST } from "@/app/api/newsletter/subscribe/route";

describe("newsletter subscribe failure contract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isEmailProviderConfigured.mockReturnValue(true);
  });

  it("returns a redacted retryable response when no provider is configured", async () => {
    isEmailProviderConfigured.mockReturnValue(false);

    const response = await POST(new NextRequest("http://localhost/api/newsletter/subscribe", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "http://localhost" },
      body: JSON.stringify({ email: "person@example.test", locale: "pt" }),
    }));

    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toMatchObject({
      dataState: { state: "retryable-error" },
    });
    expect(db.newsletterSubscriber.findUnique).not.toHaveBeenCalled();
  });

  it("returns an explicit already-subscribed state without sending again", async () => {
    db.newsletterSubscriber.findUnique.mockResolvedValue({
      id: "subscriber-1",
      confirmedAt: new Date("2026-07-12T09:00:00.000Z"),
      unsubscribedAt: null,
    });

    const response = await POST(new NextRequest("http://localhost/api/newsletter/subscribe", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "http://localhost" },
      body: JSON.stringify({ email: "person@example.test", locale: "pt" }),
    }));

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      status: "already_subscribed",
      dataState: { state: "healthy" },
    });
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("returns a redacted retryable response when subscriber storage fails", async () => {
    db.newsletterSubscriber.findUnique.mockRejectedValue(new Error("private database detail"));

    const response = await POST(new NextRequest("http://localhost/api/newsletter/subscribe", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "http://localhost" },
      body: JSON.stringify({ email: "person@example.test", locale: "pt" }),
    }));

    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const payload = await response.json();
    expect(payload).toMatchObject({ dataState: { state: "retryable-error" } });
    expect(JSON.stringify(payload)).not.toContain("private database detail");
  });

  it("returns a retryable response when the provider cannot send", async () => {
    db.newsletterSubscriber.findUnique.mockResolvedValue(null);
    db.newsletterSubscriber.create.mockResolvedValue({ id: "subscriber-1" });
    sendEmail.mockResolvedValue({ ok: false, error: "email_provider_unavailable" });

    const response = await POST(new NextRequest("http://localhost/api/newsletter/subscribe", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "http://localhost" },
      body: JSON.stringify({ email: "person@example.test", locale: "pt" }),
    }));

    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      status: "pending_confirmation",
      dataState: { state: "retryable-error" },
    });
  });
});
