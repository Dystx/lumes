// Centralized cache helper (TASK F-21 — refactor plan).
//
// In-memory cache with TTL. Use this for any API route that wants a simple
// time-bounded cache without rolling its own.
//
// Future: can be swapped for Redis / Vercel KV / Cloudflare Cache API
// without changing call sites.

interface CacheEntry<T> {
  data: T;
  ts: number;
}
const store = new Map<string, CacheEntry<unknown>>();

export interface CacheOptions {
  // Force refresh — bypass cache and re-load
  force?: boolean;
}

export async function cached<T>(
  key: string,
  ttlMs: number,
  loader: () => Promise<T>,
  opts: CacheOptions = {},
): Promise<T> {
  const hit = store.get(key);
  if (!opts.force && hit && Date.now() - hit.ts < ttlMs) {
    return hit.data as T;
  }
  const data = await loader();
  store.set(key, { data, ts: Date.now() });
  return data;
}

export function invalidate(key?: string) {
  if (key) store.delete(key);
  else store.clear();
}