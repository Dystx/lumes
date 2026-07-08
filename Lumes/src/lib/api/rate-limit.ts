// Rate limiting (F-22, refactor plan).
//
// Simple in-memory token-bucket rate limiter. For production with multiple
// instances, swap for Redis / Vercel KV / Cloudflare Workers Rate Limiting.

interface Bucket {
  tokens: number;
  ts: number;
}
const buckets = new Map<string, Bucket>();

export interface RateLimitOptions {
  /** Max requests per window. Default 60. */
  limit?: number;
  /** Window size in ms. Default 60_000 (1 minute). */
  windowMs?: number;
}

export interface RateLimitResult {
  ok: boolean;
  /** Tokens remaining in the current window. */
  remaining: number;
  /** Seconds until the bucket is fully refilled. */
  retryAfter: number;
}

/**
 * Check if a request from `key` (typically the client IP) is allowed.
 * Returns ok=false if the rate limit has been exceeded.
 */
export function rateLimit(key: string, opts: RateLimitOptions = {}): RateLimitResult {
  const limit = opts.limit ?? 60;
  const windowMs = opts.windowMs ?? 60_000;
  const now = Date.now();
  const b = buckets.get(key) ?? { tokens: limit, ts: now };
  const elapsed = now - b.ts;
  const refill = (elapsed / windowMs) * limit;
  const tokens = Math.min(limit, b.tokens + refill);

  if (tokens < 1) {
    buckets.set(key, { tokens, ts: now });
    return { ok: false, remaining: 0, retryAfter: Math.ceil(windowMs / 1000) };
  }

  buckets.set(key, { tokens: tokens - 1, ts: now });
  return { ok: true, remaining: Math.floor(tokens - 1), retryAfter: 0 };
}

/** Reset all rate-limit buckets (for tests). */
export function resetRateLimit() {
  buckets.clear();
}

/** Extract a stable key from a NextRequest — uses x-forwarded-for, then x-real-ip, then "anon". */
export function clientKey(req: Request): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
    req.headers.get("x-real-ip") ||
    "anon"
  );
}