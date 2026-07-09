// POST /api/newsletter/subscribe
//
// Body: { email: string, locale?: string }
// Effect: Creates a NewsletterSubscriber record with confirmedAt=null,
// sends a confirmation email with a unique confirmToken URL.
// Idempotent: re-subscribing an already-confirmed email returns
// { ok: true, status: "already-confirmed" } without sending another
// email. Re-subscribing an unconfirmed email reuses the existing
// row (sends a fresh confirmation if the previous link expired).

import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { db } from "@/lib/db";
import { sendEmail, buildConfirmationEmail, isEmailProviderConfigured } from "@/lib/email";
import { newsletterSubscribeSchema, validateBody } from "@/lib/api/schemas";
import { rateLimit, clientKey } from "@/lib/api/rate-limit";
import { assertSafeOrigin } from "@/lib/api/csrf";
import { createDataStateMeta } from "@/lib/data-state";

export const runtime = "nodejs";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://lumes.pt";

function hashEmail(email: string): string {
  return crypto
    .createHash("sha256")
    .update(email.toLowerCase().trim())
    .digest("hex");
}

function hashIp(ip: string | null): string | null {
  if (!ip) return null;
  // Truncate to /24 for IPv4, /48 for IPv6 — GDPR-compliant: cannot
  // identify a single individual from the truncated prefix.
  const v4Match = ip.match(/^(\d+\.\d+\.\d+)\.\d+$/);
  if (v4Match) return v4Match[1];
  return ip.split(":").slice(0, 3).join(":");
}

export async function POST(req: NextRequest) {
  const originError = assertSafeOrigin(req);
  if (originError) return originError;

  // F-22 — rate limit (5 req/min per IP for newsletter)
  const rl = rateLimit(clientKey(req), { limit: 5 });
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Rate limit exceeded", dataState: createDataStateMeta("retryable-error", "Rate limit exceeded") },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } }
    );
  }

  // Accept the current JSON client contract and legacy form posts during
  // transition so existing public links/forms remain usable.
  const contentType = req.headers.get("content-type") ?? "";
  const body = contentType.includes("application/json")
    ? await req.json().catch(() => ({} as Record<string, unknown>))
    : await req.formData()
      .then((form) => Object.fromEntries(form.entries()))
      .catch(() => ({} as Record<string, unknown>));
  if (typeof body === "object" && body !== null && "locale" in body) {
    const candidate = body as Record<string, unknown>;
    if (candidate.locale === "pt-PT") candidate.locale = "pt";
    if (candidate.locale === "en-US") candidate.locale = "en";
  }
  const v = validateBody(newsletterSubscribeSchema, body);
  if (!v.ok) {
    return NextResponse.json({ error: v.error, dataState: createDataStateMeta("empty", "Invalid newsletter request") }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
  const email = v.data.email;
  const locale = v.data.locale;

  const emailHash = hashEmail(email);
  const ipHash = hashIp(req.headers.get("x-forwarded-for"));

  if (!isEmailProviderConfigured()) {
    return NextResponse.json(
      { error: "Newsletter delivery is temporarily unavailable.", dataState: createDataStateMeta("retryable-error", "Email provider is not configured") },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  // Look up existing
  const existing = await db.newsletterSubscriber.findUnique({
    where: { emailHash },
  });

  if (existing?.confirmedAt && !existing.unsubscribedAt) {
    return NextResponse.json({
      ok: true,
      status: "already_subscribed",
      dataState: createDataStateMeta("healthy"),
    }, { headers: { "Cache-Control": "no-store" } });
  }

  // Always rotate the bearer token when a pending/unsubscribed address asks
  // again. Re-subscribing requires a fresh confirmation, never silent reactivation.
  const confirmToken = crypto.randomBytes(24).toString("hex");
  const subscriber =
    existing ??
    (await db.newsletterSubscriber.create({
      data: { email, emailHash, confirmToken, locale, ipHash },
    }));

  // Update confirmed/sent timestamps
  if (existing) {
    await db.newsletterSubscriber.update({
      where: { id: subscriber.id },
      data: {
        confirmToken,
        confirmedAt: null,
        unsubscribedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });
  }

  // Send confirmation email
  const confirmUrl = `${SITE_URL}/api/newsletter/confirm?token=${encodeURIComponent(confirmToken)}`;
  const msg = buildConfirmationEmail({
    to: email,
    confirmUrl,
    locale,
  });
  const sent = await sendEmail(msg);

  return NextResponse.json({
    ok: sent.ok,
    status: "pending_confirmation",
    dataState: createDataStateMeta(sent.ok ? "healthy" : "retryable-error", sent.ok ? undefined : "Confirmation email could not be sent"),
  }, { headers: { "Cache-Control": "no-store" } });
}
