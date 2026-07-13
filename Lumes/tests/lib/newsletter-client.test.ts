import { describe, expect, it } from "vitest";
import {
  normalizeNewsletterSubscribeResponse,
  submitNewsletterSubscription,
} from "@/lib/newsletter-client";

describe("newsletter subscribe client boundary", () => {
  it("preserves the bounded pending-confirmation acknowledgement", () => {
    expect(normalizeNewsletterSubscribeResponse({
      ok: true,
      status: "pending_confirmation",
      dataState: {
        state: "healthy",
        updatedAt: "2026-07-13T10:00:00.000Z",
      },
    })).toEqual({
      ok: true,
      status: "pending_confirmation",
      dataState: {
        state: "healthy",
        updatedAt: "2026-07-13T10:00:00.000Z",
      },
    });
  });

  it("rejects malformed successful bodies instead of returning an unsafe cast", () => {
    expect(() => normalizeNewsletterSubscribeResponse({ ok: true })).toThrow(
      "Newsletter response was malformed",
    );
  });

  it("keeps bounded server failures available to the form", async () => {
    const fetchImpl: typeof fetch = async () => new Response(JSON.stringify({
      ok: false,
      status: "pending_confirmation",
      dataState: {
        state: "retryable-error",
        updatedAt: "2026-07-13T10:00:00.000Z",
        reason: "Confirmation email could not be sent",
      },
    }), {
      status: 503,
      headers: { "content-type": "application/json" },
    });

    await expect(submitNewsletterSubscription("person@example.test", "pt", fetchImpl))
      .rejects.toThrow("Confirmation email could not be sent");
  });

  it("accepts the redacted error envelope used by non-OK newsletter routes", () => {
    expect(normalizeNewsletterSubscribeResponse({
      error: "Newsletter delivery is temporarily unavailable.",
    })).toEqual({
      ok: false,
      error: "Newsletter delivery is temporarily unavailable.",
    });
  });
});
