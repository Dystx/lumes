import crypto from "node:crypto";

const TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

function secret(): string {
  return process.env.NEWSLETTER_TOKEN_SECRET || "lumes-local-newsletter-token-secret";
}

function sign(payload: string): string {
  return crypto.createHmac("sha256", secret()).update(payload).digest("base64url");
}

export function createNewsletterActionToken(emailHash: string, now = Date.now()): string {
  const payload = `${emailHash}.${now + TOKEN_TTL_MS}`;
  return `${Buffer.from(payload).toString("base64url")}.${sign(payload)}`;
}

export function readNewsletterActionToken(token: string, now = Date.now()): string | null {
  const [encoded, signature] = token.split(".");
  if (!encoded || !signature) return null;
  let payload: string;
  try {
    payload = Buffer.from(encoded, "base64url").toString("utf8");
  } catch {
    return null;
  }
  const expected = sign(payload);
  if (signature.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
  const [emailHash, expiresAt] = payload.split(".");
  if (!emailHash || !/^\d+$/.test(expiresAt) || Number(expiresAt) < now) return null;
  return emailHash;
}
