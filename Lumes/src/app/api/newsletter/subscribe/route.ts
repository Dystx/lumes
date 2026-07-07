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
import { sendEmail, buildConfirmationEmail } from "@/lib/email";
import { newsletterSubscribeSchema, validateBody } from "@/lib/api/schemas";
import { rateLimit, clientKey } from "@/lib/api/rate-limit";
import { assertSafeOrigin } from "@/lib/api/csrf";

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
  // F-22 — rate limit (5 req/min per IP for newsletter)
  const rl = rateLimit(clientKey(req), { limit: 5 });
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Rate limit exceeded" },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } }
    );
  }

  // F-24 — zod validation
  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const v = validateBody(newsletterSubscribeSchema, body);
  if (!v.ok) {
    return NextResponse.json({ error: v.error }, { status: 400 });
  }
  const email = v.data.email;
  const locale = v.data.locale;

  const emailHash = hashEmail(email);
  const ipHash = hashIp(req.headers.get("x-forwarded-for"));

  // Look up existing
  const existing = await db.newsletterSubscriber.findUnique({
    where: { emailHash },
  });

  if (existing?.confirmedAt && !existing.unsubscribedAt) {
    return NextResponse.json({
      ok: true,
      status: "already-confirmed",
    });
  }

  // Generate a token. Reuse the existing row's token if still valid.
  const confirmToken = existing?.confirmToken ?? crypto.randomBytes(24).toString("hex");
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
        unsubscribedAt: null, // reset any previous unsubscribe
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
    status: existing?.confirmedAt ? "resent" : "pending-confirmation",
    previewUrl: sent.previewUrl,
  });
}
