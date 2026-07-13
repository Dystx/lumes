export interface StyleTransitionController {
  begin: () => number;
  current: () => number;
  invalidate: (token?: number) => void;
  isCurrent: (token: number) => boolean;
}

export interface StyleTransitionRequest {
  mapLoaded: boolean;
  mapReady: boolean;
  currentStyle: string;
  targetStyle: string;
}

/**
 * Returns whether a style effect should wait/skip. A not-yet-loaded map must
 * not be restyled during initialization, while a pending transition must be
 * allowed to reverse even when the target equals the last committed style.
 */
export function shouldSkipStyleTransition(input: StyleTransitionRequest): boolean {
  if (!input.mapLoaded) return true;
  return input.mapReady && input.currentStyle === input.targetStyle;
}

export type StyleTransitionFailureReason = "error" | "timeout" | "set-style";
export const STYLE_LOAD_TIMEOUT_MS = 10_000;

export interface StyleTransitionMap {
  once: (event: "style.load", listener: () => void) => void;
  on: (event: "error", listener: (event: unknown) => void) => void;
  off: (
    event: "style.load" | "error",
    listener: (() => void) | ((event: unknown) => void),
  ) => void;
  setStyle: (style: string) => void;
}

export interface StyleTransitionRuntimeOptions {
  map: StyleTransitionMap;
  targetStyle: string;
  fallbackStyle: string;
  timeoutMs: number;
  scheduleTimeout: (callback: () => void, timeoutMs: number) => TimerHandle;
  clearTimeout: (handle: TimerHandle) => void;
  isCurrent: () => boolean;
  onCommit: (style: string, recovered: boolean) => void;
  onRetryableFailure: (reason: StyleTransitionFailureReason) => void;
}

export interface StyleTransitionRuntime {
  start: () => void;
  dispose: () => void;
}

/**
 * MapLibre's public error event is broad. Style errors are propagated with a
 * `style` payload, while source/tile errors carry `sourceId`; diff-mode URL
 * failures can omit `style`, so a matching error URL is accepted for the
 * active target/fallback. Unknown errors are left to the bounded timeout so a
 * tile failure cannot roll back the whole basemap.
 */
export function isStyleLoadError(value: unknown, expectedStyleUrl?: string): boolean {
  if (!isRecord(value)) return false;
  if ("sourceId" in value || "tile" in value) return false;
  if ("style" in value) return true;
  if (!expectedStyleUrl || !isRecord(value.error)) return false;
  return value.error.url === expectedStyleUrl;
}

/**
 * Runs one target-style load with a bounded timeout and a single fallback to
 * the last committed style. Generation ownership is supplied by the caller;
 * stale callbacks are ignored before they can mutate map/UI state.
 */
export function createStyleTransitionRuntime(
  options: StyleTransitionRuntimeOptions,
): StyleTransitionRuntime {
  let phase: "idle" | "target" | "fallback" | "committed" | "failed" | "disposed" = "idle";
  let timeoutHandle: TimerHandle | null = null;

  const styleLoadListener = () => {
    if (!isActive()) return;
    const recovered = phase === "fallback";
    const style = recovered ? options.fallbackStyle : options.targetStyle;
    clearActiveListeners();
    phase = "committed";
    options.onCommit(style, recovered);
  };

  const errorListener = (event: unknown) => {
    const expectedStyleUrl = phase === "fallback" ? options.fallbackStyle : options.targetStyle;
    if (!isActive() || !isStyleLoadError(event, expectedStyleUrl)) return;
    fail("error");
  };

  const clearActiveListeners = () => {
    options.map.off("style.load", styleLoadListener);
    options.map.off("error", errorListener);
    if (timeoutHandle !== null) options.clearTimeout(timeoutHandle);
    timeoutHandle = null;
  };

  const arm = () => {
    options.map.once("style.load", styleLoadListener);
    options.map.on("error", errorListener);
    timeoutHandle = options.scheduleTimeout(() => fail("timeout"), options.timeoutMs);
  };

  const fail = (reason: StyleTransitionFailureReason) => {
    if (!isActive()) return;

    clearActiveListeners();
    if (phase === "target") {
      phase = "fallback";
      arm();
      try {
        options.map.setStyle(options.fallbackStyle);
      } catch {
        clearActiveListeners();
        phase = "failed";
        options.onRetryableFailure("set-style");
      }
      return;
    }

    phase = "failed";
    options.onRetryableFailure(reason);
  };

  const isActive = () =>
    (phase === "target" || phase === "fallback") && options.isCurrent();

  return {
    start: () => {
      if (phase !== "idle" || !options.isCurrent()) return;
      phase = "target";
      arm();
      try {
        options.map.setStyle(options.targetStyle);
      } catch {
        fail("set-style");
      }
    },
    dispose: () => {
      if (phase === "target" || phase === "fallback") clearActiveListeners();
      phase = "disposed";
    },
  };
}

/**
 * Owns the generation for asynchronous MapLibre style work.
 * A style.load callback is only allowed to commit if it still belongs to the
 * latest generation. This keeps stale callbacks harmless during rapid style
 * changes and unmounts.
 */
export function createStyleTransitionController(): StyleTransitionController {
  let generation = 0;

  return {
    begin: () => {
      generation += 1;
      return generation;
    },
    current: () => generation,
    invalidate: (token?: number) => {
      if (token === undefined || token === generation) generation += 1;
    },
    isCurrent: (token: number) => token === generation,
  };
}

type TimerHandle = unknown;

export interface DeferredRestoreScheduler<T> {
  schedule: (value: T) => void;
  cancel: () => void;
}

/**
 * Defers an optional-layer remount by one event-loop turn while ensuring that
 * only the most recent restore can commit. The timer and clear functions are
 * injected so this lifecycle boundary can be tested without a browser.
 */
export function createDeferredRestoreScheduler<T>(
  scheduleTimer: (callback: () => void) => TimerHandle,
  cancelTimer: (handle: TimerHandle) => void,
  commit: (value: T) => void,
): DeferredRestoreScheduler<T> {
  let generation = 0;
  let pendingHandle: TimerHandle | null = null;

  return {
    schedule: (value: T) => {
      if (pendingHandle !== null) cancelTimer(pendingHandle);
      const token = ++generation;
      pendingHandle = scheduleTimer(() => {
        if (token !== generation) return;
        pendingHandle = null;
        commit(value);
      });
    },
    cancel: () => {
      generation += 1;
      if (pendingHandle !== null) cancelTimer(pendingHandle);
      pendingHandle = null;
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
