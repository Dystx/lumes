// GET /api/newsletter/confirm?token=...
//
// Marks a subscriber as confirmed. Confirmation links are single-use. The
// page renders a small confirmation message rather than
// a JSON response so users can verify the link works in their
// browser.

import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { db } from "@/lib/db";
import { newsletterConfirmSchema, validateBody } from "@/lib/api/schemas";
import { rateLimit, clientKey } from "@/lib/api/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PAGE_OK = `<!doctype html><html lang="pt-PT"><head><meta charset="utf-8"><title>Subscrição confirmada</title>
<style>body{background:#0c1821;color:#f4f4f5;font-family:system-ui;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:1.5rem}
.card{max-width:28rem;text-align:center}
h1{color:#fb923c;font-size:1.5rem;margin:0 0 .5rem}
p{color:#a1a1aa;line-height:1.5}
a{color:#fb923c}
</style></head><body><div class="card">
<h1>Subscrição confirmada ✓</h1><p>Obrigado. A partir de agora vai receber alertas do lumes.pt.<br><br>
Pode <a href="https://lumes.pt">voltar à página principal</a>. Para cancelar, use a ligação segura recebida por email.</p></div></body></html>`;

const PAGE_ERR = `<!doctype html><html lang="pt-PT"><head><meta charset="utf-8"><title>Link inválido</title>
<style>body{background:#0c1821;color:#f4f4f5;font-family:system-ui;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:1.5rem}
.card{max-width:28rem;text-align:center}
h1{color:#fb923c;font-size:1.5rem;margin:0 0 .5rem}
p{color:#a1a1aa;line-height:1.5}
a{color:#fb923c}
</style></head><body><div class="card">
<h1>Link inválido ou expirado</h1><p>Este link de confirmação não é válido.<br><br>
Pode <a href="/newsletter">subscrever novamente</a>.</p></div></body></html>`;

function htmlResponse(body: string, status: number): NextResponse {
  return new NextResponse(body, {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

export async function GET(req: NextRequest) {
  // F-22 — rate limit (10 req/min per IP)
  const rl = rateLimit(clientKey(req), { limit: 10 });
  if (!rl.ok) {
    return htmlResponse(PAGE_ERR, 429);
  }

  const url = new URL(req.url);
  // F-24 — zod validation
  const v = validateBody(newsletterConfirmSchema, { token: url.searchParams.get("token") ?? "" });
  if (!v.ok) {
    return htmlResponse(PAGE_ERR, 400);
  }
  const token = v.data.token;
  if (!token) {
    return htmlResponse(PAGE_ERR, 400);
  }

  try {
    const sub = await db.newsletterSubscriber.findUnique({
      where: { confirmToken: token },
    });
    if (!sub) {
      return htmlResponse(PAGE_ERR, 404);
    }

    // Confirmation links are single-purpose and expire after 24 hours. An
    // unsubscribe is never silently reversed by revisiting an old link.
    const tokenExpired = Date.now() - sub.createdAt.getTime() > 24 * 60 * 60 * 1000;
    if (tokenExpired || sub.unsubscribedAt || sub.confirmedAt) {
      return htmlResponse(PAGE_ERR, 410);
    }
    if (!sub.confirmedAt) {
      await db.newsletterSubscriber.update({
        where: { id: sub.id },
        data: {
          confirmedAt: new Date(),
          // Invalidate the bearer token after the first successful use. A
          // later subscription attempt receives a fresh token in subscribe.
          confirmToken: crypto.randomBytes(24).toString("hex"),
          unsubscribedAt: null,
          updatedAt: new Date(),
        },
      });
    }

    return htmlResponse(PAGE_OK, 200);
  } catch {
    return htmlResponse(PAGE_ERR, 500);
  }
}
