// GET /api/newsletter/unsubscribe?token=...
// POST /api/newsletter/unsubscribe { token: string }
//
// Marks a subscriber as unsubscribed. The user-facing link in any
// newsletter contains a signed, expiring token. GET only renders a confirmation
// page; POST performs the mutation after origin and token validation.

import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { db } from "@/lib/db";
import { sendEmail, buildUnsubscribeEmail } from "@/lib/email";
import { rateLimit, clientKey } from "@/lib/api/rate-limit";
import { assertSafeOrigin } from "@/lib/api/csrf";
import { createNewsletterActionToken, readNewsletterActionToken } from "@/lib/newsletter-token";
import { createDataStateMeta } from "@/lib/data-state";
import { logServerFailure } from "@/lib/observability";

export const runtime = "nodejs";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://lumes.pt";

const PAGE_OK = `<!doctype html><html lang="pt-PT"><head><meta charset="utf-8"><title>Subscrição cancelada</title>
<style>body{background:#0c1821;color:#f4f4f5;font-family:system-ui;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:1.5rem}
.card{max-width:28rem;text-align:center}
h1{color:#fb923c;font-size:1.5rem;margin:0 0 .5rem}
p{color:#a1a1aa;line-height:1.5}
a{color:#fb923c}</style></head><body><div class="card">
<h1>Subscrição cancelada</h1><p>Não irá receber mais emails do lumes.pt.<br><br>
Sentiu a nossa falta? <a href="/newsletter">Subscrever novamente</a>.</p></div></body></html>`;

const PAGE_CONFIRM = (token: string) => `<!doctype html><html lang="pt-PT"><head><meta charset="utf-8"><title>Confirmar cancelamento</title>
<style>body{background:#0c1821;color:#f4f4f5;font-family:system-ui;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:1.5rem}.card{max-width:28rem;text-align:center}h1{color:#fb923c;font-size:1.5rem}p{color:#a1a1aa;line-height:1.5}button{background:#fb923c;border:0;border-radius:6px;padding:.7rem 1rem;font-weight:600}</style></head><body><div class="card"><h1>Cancelar subscrição?</h1><p>Confirme para deixar de receber emails do lumes.pt.</p><form method="post"><input type="hidden" name="token" value="${token}"><button type="submit">Confirmar cancelamento</button></form></div></body></html>`;

async function handle(sub: { id: string; email: string }, emailHash: string) {
  await db.newsletterSubscriber.update({
    where: { id: sub.id },
    data: {
      unsubscribedAt: new Date(),
      // Rotate the existing bearer field as an additional invalidation guard
      // for any future token-generating flow.
      confirmToken: crypto.randomBytes(24).toString("hex"),
      updatedAt: new Date(),
    },
  });
  const msg = buildUnsubscribeEmail({
    to: sub.email,
    unsubscribeUrl: `${SITE_URL}/api/newsletter/unsubscribe?token=${encodeURIComponent(createNewsletterActionToken(emailHash))}`,
  });
  await sendEmail(msg);
  return { ok: true, status: "cancelled" };
}

export async function GET(req: NextRequest) {
  // GET links must not mutate state (mail scanners routinely prefetch them).
  const token = new URL(req.url).searchParams.get("token") ?? "";
  if (!readNewsletterActionToken(token)) {
    return new NextResponse("Link inválido ou expirado.", { status: 410, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
  }
  return new NextResponse(PAGE_CONFIRM(token), {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}

export async function POST(req: NextRequest) {
  // S-01 CSRF protection
  const csrfBlock = assertSafeOrigin(req);
  if (csrfBlock) return csrfBlock;

  // F-22 — rate limit
  const rl = rateLimit(clientKey(req), { limit: 5 });
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Rate limit exceeded", dataState: createDataStateMeta("retryable-error", "Rate limit exceeded") },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter), "Cache-Control": "no-store" } }
    );
  }

  const contentType = req.headers.get("content-type") ?? "";
  const body = contentType.includes("application/json")
    ? await req.json().catch(() => ({} as Record<string, unknown>))
    : Object.fromEntries((await req.formData().catch(() => new FormData())).entries());
  const token = typeof body === "object" && body !== null && "token" in body
    ? String((body as Record<string, unknown>).token ?? "")
    : "";
  const tokenPayload = readNewsletterActionToken(token);
  if (!tokenPayload) return NextResponse.json({ error: "Invalid or expired unsubscribe token.", dataState: createDataStateMeta("empty", "Invalid or expired unsubscribe token") }, { status: 410, headers: { "Cache-Control": "no-store" } });
  try {
    const sub = await db.newsletterSubscriber.findUnique({ where: { emailHash: tokenPayload.emailHash } });
    if (!sub) return NextResponse.json({ ok: true, status: "noop" }, { headers: { "Cache-Control": "no-store" } });
    if (sub.unsubscribedAt || sub.updatedAt.getTime() > tokenPayload.issuedAt) {
      return NextResponse.json({ error: "Invalid or expired unsubscribe token.", dataState: createDataStateMeta("empty", "Token has already been used") }, { status: 410, headers: { "Cache-Control": "no-store" } });
    }
    const result = await handle(sub, tokenPayload.emailHash);
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (err: unknown) {
    logServerFailure("newsletter.unsubscribe", err, { route: "/api/newsletter/unsubscribe", retryable: true });
    return NextResponse.json(
      { error: "Newsletter unsubscribe is temporarily unavailable.", dataState: createDataStateMeta("retryable-error", "Newsletter service unavailable") },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
