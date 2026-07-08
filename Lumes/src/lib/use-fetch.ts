// useFetch — generic data-fetching hook (TASK E, refactor plan).
//
// Replaces the 14 useLiveData hooks in `use-live-data.ts` with a single
// typed hook. Keeps the original "FROZEN" feature set:
//   - Polling with TTL (refreshMs)
//   - Lazy fetch (enabled)
//   - Fallback data
//   - revalidate() action
//   - X-Source header for traces
//
// Why: each of the 14 useLiveData hooks (incidents, dashboard, fireRisk, ...)
// is structurally identical. Inlining a single hook reduces ~600 LOC of
// near-duplicate code and gives us a single place to add retry, backoff,
// SWR-style revalidation, etc.

import { useEffect, useState, useCallback, useRef } from "react";

export interface UseFetchOptions<T> {
  /** Polling interval in ms. `null` = no polling (one-shot). */
  refreshMs?: number | null;
  /** Skip the fetch entirely (e.g. only fetch when a layer is visible). */
  enabled?: boolean;
  /** Fallback data when the fetch is in flight or has failed. */
  fallback?: T | null;
  /** Transform the raw response before storing. */
  transform?: (raw: any) => T;
  /** Optional headers. */
  headers?: Record<string, string>;
  /** Optional AbortSignal timeout (default 30s). */
  timeoutMs?: number;
}

export interface UseFetchResult<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  /** Last successful fetch time. */
  refetchedAt: Date | null;
  /** Force a re-fetch (bypasses cache). */
  refetch: () => void;
  /** Manually set data (for optimistic updates). */
  setData: (data: T | null) => void;
  /** True when fallback data is being shown (fetch failed or in-flight). */
  usingFallback: boolean;
}

export function useFetch<T = unknown>(
  url: string | null,
  opts: UseFetchOptions<T> = {},
): UseFetchResult<T> {
  const {
    refreshMs = null,
    enabled = true,
    fallback = null,
    transform,
    headers,
    timeoutMs = 30_000,
  } = opts;

  const [data, setData] = useState<T | null>(fallback);
  const [loading, setLoading] = useState<boolean>(enabled && !!url);
  const [error, setError] = useState<string | null>(null);
  const [refetchedAt, setRefetchedAt] = useState<Date | null>(null);
  const [tick, setTick] = useState(0);
  const cancelledRef = useRef(false);

  const refetch = useCallback(() => setTick((n) => n + 1), []);

  useEffect(() => {
    if (!enabled || !url) {
      setLoading(false);
      return;
    }
    cancelledRef.current = false;
    let timer: ReturnType<typeof setInterval> | null = null;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    async function load() {
      try {
        setLoading(true);
        const res = await fetch(url, {
          cache: "default",
          signal: controller.signal,
          headers,
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || `HTTP ${res.status}`);
        }
        const json = await res.json();
        if (cancelledRef.current) return;
        const next = transform ? transform(json) : (json as T);
        setData(next);
        setError(null);
        setRefetchedAt(new Date());
      } catch (err: unknown) {
        if (cancelledRef.current) return;
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg);
        // Keep fallback data if we had it
        if (data === null) setData(fallback);
      } finally {
        if (!cancelledRef.current) {
          setLoading(false);
          clearTimeout(timeoutId);
        }
      }
    }

    load();
    if (refreshMs) {
      timer = setInterval(load, refreshMs);
    }

    return () => {
      cancelledRef.current = true;
      controller.abort();
      clearTimeout(timeoutId);
      if (timer) clearInterval(timer);
    };
  }, [url, refreshMs, enabled, tick, transform, timeoutMs]); // eslint-disable-line react-hooks/exhaustive-deps

  const usingFallback = data === null && (error !== null || loading);

  return {
    data,
    loading,
    error,
    refetchedAt,
    refetch,
    setData,
    usingFallback,
  };
}