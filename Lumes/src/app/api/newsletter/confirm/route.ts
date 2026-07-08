// GET /api/newsletter/confirm?token=...
//
// Marks a subscriber as confirmed. Idempotent — calling twice is a
// no-op. The page renders a small confirmation message rather than
// a JSON response so users can verify the link works in their
// browser.

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { newsletterConfirmSchema, validateBody } from "@/lib/api/schemas";
import { rateLimit, clientKey } from "@/lib/api/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PAGE_OK = `<!doctype html><html lang="pt"><head><meta charset="utf-8"><title>Subscrição confirmada</title>
<style>body{background:#0c1821;color:#f4f4f5;font-family:system-ui;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:1.5rem}
.card{max-width:28rem;text-align:center}
h1{color:#fb923c;font-size:1.5rem;margin:0 0 .5rem}
p{color:#a1a1aa;line-height:1.5}
a{color:#fb923c}
</style></head><body><div class="card">
<h1>Subscrição confirmada ✓</h1><p>Obrigado. A partir de agora vai receber alertas do lumes.pt.<br><br>
Pode <a href="https://lumes.pt">voltar à página principal</a> ou <a href="/api/newsletter/unsubscribe">cancelar a subscrição</a> a qualquer momento.</p></div></body></html>`;

const PAGE_ERR = `<!doctype html><html lang="pt"><head><meta charset="utf-8"><title>Link inválido</title>
<style>body{background:#0c1821;color:#f4f4f5;font-family:system-ui;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:1.5rem}
.card{max-width:28rem;text-align:center}
h1{color:#fb923c;font-size:1.5rem;margin:0 0 .5rem}
p{color:#a1a1aa;line-height:1.5}
a{color:#fb923c}
</style></head><body><div class="card">
<h1>Link inválido ou expirado</h1><p>Este link de confirmação não é válido.<br><br>
Pode <a href="/newsletter">subscrever novamente</a>.</p></div></body></html>`;

export async function GET(req: NextRequest) {
  // F-22 — rate limit (10 req/min per IP)
  const rl = rateLimit(clientKey(req), { limit: 10 });
  if (!rl.ok) {
    return new NextResponse(PAGE_ERR, { status: 429, headers: { "Content-Type": "text/html; charset=utf-8" } });
  }

  const url = new URL(req.url);
  // F-24 — zod validation
  const v = validateBody(newsletterConfirmSchema, { token: url.searchParams.get("token") ?? "" });
  if (!v.ok) {
    return new NextResponse(PAGE_ERR, { status: 400, headers: { "Content-Type": "text/html; charset=utf-8" } });
  }
  const token = v.data.token;
  if (!token) {
    return new NextResponse(PAGE_ERR, { status: 400, headers: { "Content-Type": "text/html; charset=utf-8" } });
  }

  try {
    const sub = await db.newsletterSubscriber.findUnique({
      where: { confirmToken: token },
    });
    if (!sub) {
      return new NextResponse(PAGE_ERR, { status: 404, headers: { "Content-Type": "text/html; charset=utf-8" } });
    }

    if (!sub.confirmedAt || sub.unsubscribedAt) {
      await db.newsletterSubscriber.update({
        where: { id: sub.id },
        data: {
          confirmedAt: new Date(),
          unsubscribedAt: null,
          updatedAt: new Date(),
        },
      });
    }

    return new NextResponse(PAGE_OK, {
      status: 200,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  } catch {
    return new NextResponse(PAGE_ERR, { status: 500, headers: { "Content-Type": "text/html; charset=utf-8" } });
  }
}
