// useFetch — shared data fetching with bounded polling and explicit trust state.

import { useEffect, useState, useCallback, useRef } from "react";
import { createDataStateMeta, resolveDataStateMeta, type DataStateMeta } from "@/lib/data-state";
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
  /** Resolves after the refresh attempt has settled, including retryable errors. */
  refetchAsync: () => Promise<void>;
  setData: (data: T | null) => void;
  usingFallback: boolean;
  dataState: DataStateMeta | null;
  trust: DataTrustState;
}

export interface FetchJsonOptions {
  controller?: AbortController;
  timeoutMs: number;
  headers?: Record<string, string>;
  fetchImpl?: typeof fetch;
}

/**
 * One bounded request attempt. The caller owns the controller so unmounting a
 * hook can still abort the active attempt; every retry passes a fresh one.
 */
export async function fetchJsonWithTimeout(
  endpoint: string,
  { controller = new AbortController(), timeoutMs, headers, fetchImpl = globalThis.fetch }: FetchJsonOptions,
): Promise<unknown> {
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(endpoint, {
      cache: "default",
      signal: controller.signal,
      headers,
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.error || `HTTP ${response.status}`);
    }
    const body: unknown = await response.json();
    return body;
  } finally {
    clearTimeout(timeoutId);
  }
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

export function resolveResponseDataState(value: unknown): ReturnType<typeof resolveDataStateMeta> {
  return resolveDataStateMeta(value);
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
  const requestGenerationRef = useRef(0);
  const pendingRefetchesRef = useRef<Set<() => void>>(new Set());

  const refetch = useCallback(() => {
    if (!enabled || !url) return;
    // Clear the previous generation synchronously so consumers cannot settle
    // a new refresh from stale error state before its effect starts loading.
    setError(null);
    setLoading(true);
    setTick((n) => n + 1);
  }, [enabled, url]);
  const refetchAsync = useCallback(() => {
    if (!enabled || !url) return Promise.resolve();

    // Keep awaitable and event-driven retries aligned with the same lifecycle
    // boundary as `refetch`; polling still clears this state inside `load`.
    setError(null);
    setLoading(true);
    return new Promise<void>((resolve) => {
      pendingRefetchesRef.current.add(resolve);
      setTick((n) => n + 1);
    });
  }, [enabled, url]);
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
    const requestGeneration = ++requestGenerationRef.current;
    let cancelled = false;
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
        // A new request generation must not inherit the previous generation's
        // error. Consumers use `error` to settle refresh attempts, so leaving
        // stale text here can terminate a retry before its network request has
        // settled.
        setError(null);
        setLoading(true);
        const json = await fetchJsonWithTimeout(endpoint, {
          controller,
          timeoutMs,
          headers,
        });
        if (cancelled) return;
        const next = transform ? transform(json) : (json as T);
        const responseMetaValue = typeof json === "object" && json !== null && !Array.isArray(json)
          && Object.prototype.hasOwnProperty.call(json, "dataState")
          ? (json as { dataState?: unknown }).dataState
          : undefined;
        const responseMeta = resolveResponseDataState(responseMetaValue);
        if (!responseMeta.valid) {
          setDataState(responseMeta.meta);
          setError(responseMeta.meta.reason ?? "Invalid data state metadata");
          if (dataRef.current === null) setData(fallbackRef.current);
          return;
        }

        setData(next);
        setDataState(responseMeta.meta);
        setError(null);
        setRefetchedAt(new Date());
      } catch (err: unknown) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
        setDataState((previous) => previous?.state === "fallback"
          ? previous
          : createDataStateMeta("retryable-error", "Unable to refresh this data"));
        if (dataRef.current === null) setData(fallbackRef.current);
      } finally {
        clearTimeout(timeoutId);
        if (activeController === controller) activeController = null;
        inFlight = false;
        if (!cancelled) setLoading(false);
        if (requestGeneration === requestGenerationRef.current) {
          const pending = Array.from(pendingRefetchesRef.current);
          pendingRefetchesRef.current.clear();
          pending.forEach((resolve) => resolve());
        }
      }
    }

    void load();
    if (refreshMs) timer = setInterval(() => void load(), refreshMs);

    return () => {
      cancelled = true;
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

  return { data, loading, error, refetchedAt, refetch, refetchAsync, setData, usingFallback, dataState, trust };
}
