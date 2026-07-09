// useFetch — shared data fetching with bounded polling and explicit trust state.

import { useEffect, useState, useCallback, useRef } from "react";
import { createDataStateMeta, type DataStateMeta } from "@/lib/data-state";
import { deriveDataTrust, type DataTrustState } from "@/lib/data-trust";

export interface UseFetchOptions<T> {
  refreshMs?: number | null;
  enabled?: boolean;
  fallback?: T | null;
  transform?: (raw: unknown) => T;
  headers?: Record<string, string>;
  timeoutMs?: number;
}

export interface UseFetchResult<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  refetchedAt: Date | null;
  refetch: () => void;
  setData: (data: T | null) => void;
  usingFallback: boolean;
  dataState: DataStateMeta | null;
  trust: DataTrustState;
}

/** Retained data remains useful, but a failed refresh must still be visible. */
export function shouldMarkUsingFallback({
  data,
  loading,
  error,
}: {
  data: unknown;
  loading: boolean;
  error: string | null;
}): boolean {
  return error !== null || (data === null && loading);
}

function isDataStateMeta(value: unknown): value is DataStateMeta {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<DataStateMeta>;
  return typeof candidate.state === "string" && typeof candidate.updatedAt === "string";
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

  const [data, setStoredData] = useState<T | null>(fallback);
  const dataRef = useRef<T | null>(fallback);
  const fallbackRef = useRef<T | null>(fallback);
  fallbackRef.current = fallback;
  const [loading, setLoading] = useState<boolean>(enabled && !!url);
  const [error, setError] = useState<string | null>(null);
  const [refetchedAt, setRefetchedAt] = useState<Date | null>(null);
  const [dataState, setDataState] = useState<DataStateMeta | null>(null);
  const [tick, setTick] = useState(0);
  const cancelledRef = useRef(false);

  const refetch = useCallback(() => setTick((n) => n + 1), []);
  const setData = useCallback((next: T | null) => {
    dataRef.current = next;
    setStoredData(next);
  }, []);

  useEffect(() => {
    if (!enabled || !url) {
      setLoading(false);
      return;
    }

    const endpoint = url;
    cancelledRef.current = false;
    let timer: ReturnType<typeof setInterval> | null = null;
    let inFlight = false;
    let activeController: AbortController | null = null;

    async function load() {
      if (inFlight) return;
      inFlight = true;
      const controller = new AbortController();
      activeController = controller;
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      try {
        setLoading(true);
        const res = await fetch(endpoint, {
          cache: "default",
          signal: controller.signal,
          headers,
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || `HTTP ${res.status}`);
        }
        const json: unknown = await res.json();
        if (cancelledRef.current) return;
        const next = transform ? transform(json) : (json as T);
        setData(next);
        const responseMeta = isDataStateMeta((json as { dataState?: unknown }).dataState)
          ? (json as { dataState: DataStateMeta }).dataState
          : createDataStateMeta("healthy");
        setDataState(responseMeta);
        setError(null);
        setRefetchedAt(new Date());
      } catch (err: unknown) {
        if (cancelledRef.current) return;
        setError(err instanceof Error ? err.message : String(err));
        setDataState((previous) => previous?.state === "fallback"
          ? previous
          : createDataStateMeta("retryable-error", "Unable to refresh this data"));
        if (dataRef.current === null) setData(fallbackRef.current);
      } finally {
        clearTimeout(timeoutId);
        if (activeController === controller) activeController = null;
        inFlight = false;
        if (!cancelledRef.current) setLoading(false);
      }
    }

    void load();
    if (refreshMs) timer = setInterval(() => void load(), refreshMs);

    return () => {
      cancelledRef.current = true;
      activeController?.abort();
      if (timer) clearInterval(timer);
    };
  }, [url, refreshMs, enabled, headers, transform, timeoutMs, setData, tick]);

  const usingFallback = shouldMarkUsingFallback({ data, loading, error });
  const trust = deriveDataTrust({
    meta: dataState,
    observedAt: refetchedAt ?? new Date(),
    source: url ?? "unknown",
    loading,
    error,
  });

  return { data, loading, error, refetchedAt, refetch, setData, usingFallback, dataState, trust };
}
