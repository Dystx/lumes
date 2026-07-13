import { describe, expect, it } from "vitest";
import {
  createDeferredRestoreScheduler,
  createStyleTransitionController,
  createStyleTransitionRuntime,
  isStyleLoadError,
  shouldSkipStyleTransition,
} from "@/lib/map/style-transition";

describe("style transition controller", () => {
  it("does not restyle before initial map load", () => {
    expect(shouldSkipStyleTransition({
      mapLoaded: false,
      mapReady: false,
      currentStyle: "",
      targetStyle: "dark",
    })).toBe(true);
  });

  it("allows a requested reversal while the previous style is still pending", () => {
    expect(shouldSkipStyleTransition({
      mapLoaded: true,
      mapReady: false,
      currentStyle: "dark",
      targetStyle: "dark",
    })).toBe(false);
  });

  it("allows the latest props to reconcile after the initial load", () => {
    expect(shouldSkipStyleTransition({
      mapLoaded: true,
      mapReady: true,
      currentStyle: "dark",
      targetStyle: "light",
    })).toBe(false);
  });

  it("skips a no-op after the committed style is ready", () => {
    expect(shouldSkipStyleTransition({
      mapLoaded: true,
      mapReady: true,
      currentStyle: "dark",
      targetStyle: "dark",
    })).toBe(true);
  });

  it("invalidates older generations when a newer style transition begins", () => {
    const controller = createStyleTransitionController();
    const first = controller.begin();
    const second = controller.begin();

    expect(controller.isCurrent(first)).toBe(false);
    expect(controller.isCurrent(second)).toBe(true);
  });

  it("invalidates the current generation during cleanup", () => {
    const controller = createStyleTransitionController();
    const token = controller.begin();

    controller.invalidate(token);

    expect(controller.isCurrent(token)).toBe(false);
  });

  it("commits only the latest deferred restore", () => {
    const callbacks: Array<() => void> = [];
    const cancelled = new Set<unknown>();
    const committed: string[] = [];
    const scheduler = createDeferredRestoreScheduler(
      (callback) => {
        callbacks.push(callback);
        return callback;
      },
      (handle) => {
        cancelled.add(handle);
      },
      (value: string) => committed.push(value),
    );

    scheduler.schedule("first");
    scheduler.schedule("second");
    callbacks[0]?.();
    callbacks[1]?.();

    expect(cancelled.has(callbacks[0])).toBe(true);
    expect(committed).toEqual(["second"]);
  });

  it("does not commit after cancellation", () => {
    const callbacks: Array<() => void> = [];
    const committed: string[] = [];
    const scheduler = createDeferredRestoreScheduler(
      (callback) => {
        callbacks.push(callback);
        return callback;
      },
      () => undefined,
      (value: string) => committed.push(value),
    );

    scheduler.schedule("pending");
    scheduler.cancel();
    callbacks[0]?.();

    expect(committed).toEqual([]);
  });

  it("identifies style-propagated errors without treating tile errors as style failures", () => {
    expect(isStyleLoadError({ style: {}, error: { message: "style failed" } })).toBe(true);
    expect(isStyleLoadError({ error: { url: "light", message: "AJAXError: 503" } }, "light")).toBe(true);
    expect(isStyleLoadError({ error: { url: "other", message: "AJAXError: 503" } }, "light")).toBe(false);
    expect(isStyleLoadError({ sourceId: "roads", error: { message: "tile failed" } })).toBe(false);
    expect(isStyleLoadError({ error: { message: "unclassified" } })).toBe(false);
  });

  it("commits a successful target style and clears its timeout", () => {
    const map = createFakeStyleMap();
    const timers = createFakeTimers();
    const commits: Array<{ style: string; recovered: boolean }> = [];
    const failures: string[] = [];
    const runtime = createStyleTransitionRuntime({
      map,
      targetStyle: "light",
      fallbackStyle: "dark",
      timeoutMs: 100,
      scheduleTimeout: timers.schedule,
      clearTimeout: timers.clear,
      isCurrent: () => true,
      onCommit: (style, recovered) => commits.push({ style, recovered }),
      onRetryableFailure: (reason) => failures.push(reason),
    });

    runtime.start();
    map.emit("style.load");
    map.emit("style.load");

    expect(map.setStyleCalls).toEqual(["light"]);
    expect(commits).toEqual([{ style: "light", recovered: false }]);
    expect(failures).toEqual([]);
    expect(timers.cancelled).toHaveLength(1);
  });

  it("rolls back once after a target error or timeout and commits the last-known-good style", () => {
    const map = createFakeStyleMap();
    const timers = createFakeTimers();
    const commits: Array<{ style: string; recovered: boolean }> = [];
    const failures: string[] = [];
    const runtime = createStyleTransitionRuntime({
      map,
      targetStyle: "light",
      fallbackStyle: "dark",
      timeoutMs: 100,
      scheduleTimeout: timers.schedule,
      clearTimeout: timers.clear,
      isCurrent: () => true,
      onCommit: (style, recovered) => commits.push({ style, recovered }),
      onRetryableFailure: (reason) => failures.push(reason),
    });

    runtime.start();
    map.emit("error", { error: { url: "light", message: "AJAXError: 503" } });
    expect(map.setStyleCalls).toEqual(["light", "dark"]);
    map.emit("style.load");

    expect(commits).toEqual([{ style: "dark", recovered: true }]);
    expect(failures).toEqual([]);

    const timeoutMap = createFakeStyleMap();
    const timeoutTimers = createFakeTimers();
    const timeoutRuntime = createStyleTransitionRuntime({
      map: timeoutMap,
      targetStyle: "light",
      fallbackStyle: "dark",
      timeoutMs: 100,
      scheduleTimeout: timeoutTimers.schedule,
      clearTimeout: timeoutTimers.clear,
      isCurrent: () => true,
      onCommit: () => undefined,
      onRetryableFailure: (reason) => failures.push(reason),
    });
    timeoutRuntime.start();
    timeoutTimers.fireLatest();
    expect(timeoutMap.setStyleCalls).toEqual(["light", "dark"]);
  });

  it("reports one retryable failure when rollback also fails", () => {
    const map = createFakeStyleMap();
    const timers = createFakeTimers();
    const failures: string[] = [];
    let setStyleCount = 0;
    map.setStyle = (style: string) => {
      setStyleCount += 1;
      map.setStyleCalls.push(style);
      if (setStyleCount === 2) throw new Error("fallback unavailable");
    };
    const runtime = createStyleTransitionRuntime({
      map,
      targetStyle: "light",
      fallbackStyle: "dark",
      timeoutMs: 100,
      scheduleTimeout: timers.schedule,
      clearTimeout: timers.clear,
      isCurrent: () => true,
      onCommit: () => undefined,
      onRetryableFailure: (reason) => failures.push(reason),
    });

    runtime.start();
    map.emit("error", { style: {}, error: { message: "style failed" } });
    map.emit("error", { style: {}, error: { message: "late fallback failure" } });
    timers.fireLatest();

    expect(failures).toEqual(["set-style"]);
    expect(map.setStyleCalls).toEqual(["light", "dark"]);
  });

  it("ignores stale timeout/error callbacks after invalidation and removes listeners on dispose", () => {
    const map = createFakeStyleMap();
    const timers = createFakeTimers();
    let current = true;
    const commits: string[] = [];
    const failures: string[] = [];
    const runtime = createStyleTransitionRuntime({
      map,
      targetStyle: "light",
      fallbackStyle: "dark",
      timeoutMs: 100,
      scheduleTimeout: timers.schedule,
      clearTimeout: timers.clear,
      isCurrent: () => current,
      onCommit: (style) => commits.push(style),
      onRetryableFailure: (reason) => failures.push(reason),
    });

    runtime.start();
    current = false;
    map.emit("error", { style: {}, error: { message: "stale" } });
    timers.fireLatest();
    runtime.dispose();
    map.emit("style.load");

    expect(map.setStyleCalls).toEqual(["light"]);
    expect(commits).toEqual([]);
    expect(failures).toEqual([]);
    expect(map.offCalls).toBeGreaterThanOrEqual(2);
  });
});

interface FakeStyleMap {
  setStyleCalls: string[];
  offCalls: number;
  setStyle: (style: string) => void;
  once: (event: "style.load", listener: () => void) => void;
  on: (event: "error", listener: (event: unknown) => void) => void;
  off: (event: "style.load" | "error", listener: (...args: never[]) => void) => void;
  emit: (event: "style.load" | "error", payload?: unknown) => void;
}

function createFakeStyleMap(): FakeStyleMap {
  let styleListener: (() => void) | null = null;
  let errorListener: ((event: unknown) => void) | null = null;
  const map: FakeStyleMap = {
    setStyleCalls: [],
    offCalls: 0,
    setStyle: (style) => map.setStyleCalls.push(style),
    once: (_event, listener) => {
      styleListener = listener;
    },
    on: (_event, listener) => {
      errorListener = listener;
    },
    off: (_event, _listener) => {
      map.offCalls += 1;
      styleListener = null;
      errorListener = null;
    },
    emit: (event, payload) => {
      if (event === "style.load") {
        const listener = styleListener;
        styleListener = null;
        listener?.();
      } else {
        errorListener?.(payload);
      }
    },
  };
  return map;
}

function createFakeTimers() {
  const callbacks: Array<() => void> = [];
  const cancelled: unknown[] = [];
  return {
    schedule: (callback: () => void) => {
      callbacks.push(callback);
      return callback;
    },
    clear: (handle: unknown) => cancelled.push(handle),
    fireLatest: () => callbacks.at(-1)?.(),
    cancelled,
  };
}
