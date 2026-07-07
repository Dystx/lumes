// GET /api/newsletter/unsubscribe?email=...
// POST /api/newsletter/unsubscribe { email: string }
//
// Marks a subscriber as unsubscribed. The user-facing link in any
// newsletter should be `https://lumes.pt/api/newsletter/unsubscribe?email=...`
// or have the form post the user's email to this URL.

import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { db } from "@/lib/db";
import { sendEmail, buildUnsubscribeEmail } from "@/lib/email";
import { newsletterUnsubscribeSchema, validateBody } from "@/lib/api/schemas";
import { rateLimit, clientKey } from "@/lib/api/rate-limit";
import { assertSafeOrigin } from "@/lib/api/csrf";

export const runtime = "nodejs";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://lumes.pt";

function hashEmail(email: string): string {
  return crypto.createHash("sha256").update(email.toLowerCase().trim()).digest("hex");
}

const PAGE_OK = `<!doctype html><html lang="pt"><head><meta charset="utf-8"><title>Subscrição cancelada</title>
<style>body{background:#0c1821;color:#f4f4f5;font-family:system-ui;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:1.5rem}
.card{max-width:28rem;text-align:center}
h1{color:#fb923c;font-size:1.5rem;margin:0 0 .5rem}
p{color:#a1a1aa;line-height:1.5}
a{color:#fb923c}</style></head><body><div class="card">
<h1>Subscrição cancelada</h1><p>Não irá receber mais emails do lumes.pt.<br><br>
Sentiu a nossa falta? <a href="/newsletter">Subscrever novamente</a>.</p></div></body></html>`;

async function handle(email: string) {
  if (!email) return { ok: false, status: 400 };
  const emailHash = hashEmail(email);
  const sub = await db.newsletterSubscriber.findUnique({ where: { emailHash } });
  if (!sub) {
    // Already not subscribed — treat as success to avoid leaking info.
    return { ok: true, status: "noop" };
  }
  if (sub.unsubscribedAt) {
    return { ok: true, status: "noop" };
  }
  await db.newsletterSubscriber.update({
    where: { id: sub.id },
    data: { unsubscribedAt: new Date(), updatedAt: new Date() },
  });
  const msg = buildUnsubscribeEmail({
    to: sub.email,
    unsubscribeUrl: `${SITE_URL}/newsletter`,
  });
  await sendEmail(msg);
  return { ok: true, status: "cancelled" };
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const email = url.searchParams.get("email") ?? "";
  const result = await handle(email);
  return new NextResponse(PAGE_OK, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
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
      { error: "Rate limit exceeded" },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } }
    );
  }

  // F-24 — zod validation
  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const v = validateBody(newsletterUnsubscribeSchema, body);
  if (!v.ok) {
    return NextResponse.json({ error: v.error }, { status: 400 });
  }
  const result = await handle(v.data.email);
  return NextResponse.json(result);
}
